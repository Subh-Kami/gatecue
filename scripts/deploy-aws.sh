#!/usr/bin/env bash
# Deploys GateCue to AWS: one small Graviton EC2 instance (t4g.micro by default) running the MCP server and the
# simulator, with automatic HTTPS from Caddy on a <ip>.sslip.io name. Run it again to ship an update.
# Needs: AWS CLI v2 logged in (aws login), in the account that owns the gatecue-memory table.
# Cost: roughly $10 a month (instance, public IPv4, 8 GB disk). Stop with scripts/destroy-aws.sh.
set -euo pipefail
cd "$(dirname "$0")/.."

REGION="${AWS_REGION:-us-east-1}"
export AWS_REGION="$REGION" AWS_DEFAULT_REGION="$REGION" AWS_PAGER=""
NAME=gatecue
TYPE="${GC_INSTANCE_TYPE:-t4g.micro}"
TABLE="${GC_MEMORY_TABLE:-gatecue-memory}"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
BUCKET="gatecue-deploy-$ACCOUNT-$REGION"
ROLE=gatecue-ec2
TMP=$(mktemp -d)
step() { printf '\n▸ %s\n' "$*"; }

step "Packaging the app (no keys, no .env, no local data)"
tar -czf "$TMP/app.tgz" --exclude=./node_modules --exclude=./.git --exclude=./_sync --exclude=./_to_delete \
  --exclude=./data --exclude=./design --exclude=./docs --exclude=./dist --exclude=./.env --exclude=.DS_Store .
ls -lh "$TMP/app.tgz" | awk '{print "  " $5}'

step "S3 bucket for releases: $BUCKET"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [ "$REGION" = "us-east-1" ]; then aws s3api create-bucket --bucket "$BUCKET" >/dev/null
  else aws s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null; fi
  aws s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
fi
aws s3 cp "$TMP/app.tgz" "s3://$BUCKET/app.tgz" --only-show-errors

step "IAM role for the instance: $ROLE (only what GateCue calls)"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-role --role-name "$ROLE" --description "GateCue server on EC2" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
fi
cat > "$TMP/policy.json" <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["dynamodb:GetItem","dynamodb:PutItem","dynamodb:Query","dynamodb:DeleteItem"],"Resource":"arn:aws:dynamodb:$REGION:$ACCOUNT:table/$TABLE"},
 {"Effect":"Allow","Action":["geo-routes:CalculateRoutes"],"Resource":"*"},
 {"Effect":"Allow","Action":["polly:SynthesizeSpeech"],"Resource":"*"},
 {"Effect":"Allow","Action":["ses:SendEmail"],"Resource":"*"},
 {"Effect":"Allow","Action":["bedrock:InvokeModel","bedrock:InvokeModelWithResponseStream","bedrock:Converse","bedrock:ConverseStream"],"Resource":"*"},
 {"Effect":"Allow","Action":["s3:GetObject"],"Resource":"arn:aws:s3:::$BUCKET/*"}
]}
EOF
aws iam put-role-policy --role-name "$ROLE" --policy-name gatecue-runtime --policy-document "file://$TMP/policy.json"
if ! aws iam get-instance-profile --instance-profile-name "$ROLE" >/dev/null 2>&1; then
  aws iam create-instance-profile --instance-profile-name "$ROLE" >/dev/null
  aws iam add-role-to-instance-profile --instance-profile-name "$ROLE" --role-name "$ROLE"
  echo "  waiting for the new role to be usable…"; sleep 15
fi

INSTANCE=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=$NAME" "Name=instance-state-name,Values=pending,running,stopped,stopping" \
  --query 'Reservations[0].Instances[0].InstanceId' --output text)

if [ "$INSTANCE" != "None" ] && [ -n "$INSTANCE" ]; then
  step "Updating the running instance $INSTANCE"
  STATE=$(aws ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].State.Name' --output text)
  if [ "$STATE" = "stopped" ]; then aws ec2 start-instances --instance-ids "$INSTANCE" >/dev/null; aws ec2 wait instance-running --instance-ids "$INSTANCE"; sleep 20; fi
  CMD=$(aws ssm send-command --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
    --parameters 'commands=["/usr/local/bin/gatecue-update"]' --query Command.CommandId --output text)
  echo "  update started (command $CMD); waiting…"
  aws ssm wait command-executed --command-id "$CMD" --instance-id "$INSTANCE" || true
  aws ssm get-command-invocation --command-id "$CMD" --instance-id "$INSTANCE" --query '[Status,StandardOutputContent]' --output text | tail -5
else
  step "Network: security group for HTTP/HTTPS"
  VPC=$(aws ec2 describe-vpcs --filters Name=is-default,Values=true --query 'Vpcs[0].VpcId' --output text)
  SG=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=$NAME-web" "Name=vpc-id,Values=$VPC" --query 'SecurityGroups[0].GroupId' --output text)
  if [ "$SG" = "None" ]; then
    SG=$(aws ec2 create-security-group --group-name "$NAME-web" --description "GateCue HTTPS" --vpc-id "$VPC" --query GroupId --output text)
    aws ec2 authorize-security-group-ingress --group-id "$SG" --ip-permissions \
      'IpProtocol=tcp,FromPort=80,ToPort=80,IpRanges=[{CidrIp=0.0.0.0/0}]' 'IpProtocol=tcp,FromPort=443,ToPort=443,IpRanges=[{CidrIp=0.0.0.0/0}]' >/dev/null
  fi

  step "Launching a $TYPE instance (Amazon Linux 2023, arm64)"
  AMI=$(aws ssm get-parameter --name /aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64 --query Parameter.Value --output text)
  sed -e "s/__BUCKET__/$BUCKET/g" -e "s/__REGION__/$REGION/g" -e "s/__TABLE__/$TABLE/g" scripts/ec2-user-data.sh > "$TMP/user-data.sh"
  # A brand-new instance profile can take a little while to be accepted by EC2, so retry a few times.
  INSTANCE=""
  for attempt in 1 2 3 4 5 6; do
    if INSTANCE=$(aws ec2 run-instances --image-id "$AMI" --instance-type "$TYPE" --iam-instance-profile Name="$ROLE" \
      --security-group-ids "$SG" --user-data "file://$TMP/user-data.sh" \
      --metadata-options HttpTokens=required,HttpEndpoint=enabled \
      --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":8,"VolumeType":"gp3"}}]' \
      --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$NAME}]" --query 'Instances[0].InstanceId' --output text 2>"$TMP/err"); then break; fi
    if grep -q "Invalid IAM Instance Profile" "$TMP/err"; then echo "  role not ready yet, retrying…"; sleep 10; else cat "$TMP/err"; exit 1; fi
  done
  [ -n "$INSTANCE" ] || { echo "Couldn't launch the instance."; exit 1; }
  echo "  instance $INSTANCE starting; first boot installs Node and builds GateCue (about 4 minutes)…"
  aws ec2 wait instance-running --instance-ids "$INSTANCE"
fi

IP=$(aws ec2 describe-instances --instance-ids "$INSTANCE" --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)
HOST="$(echo "$IP" | tr . -).sslip.io"
step "Waiting for https://$HOST to answer"
for i in $(seq 1 60); do
  if curl -fsS --max-time 5 "https://$HOST/healthz" >/dev/null 2>&1; then
    printf '\nGateCue is live:\n  Simulator   https://%s/sim/\n  MCP server  https://%s/mcp\n' "$HOST" "$HOST"; rm -rf "$TMP"; exit 0
  fi
  sleep 10
done
echo "Not answering yet. It may still be building; try https://$HOST/sim/ in a few minutes."
echo "Logs: aws ssm start-session --target $INSTANCE   then: sudo journalctl -u gatecue -u caddy --no-pager | tail -50"
rm -rf "$TMP"
