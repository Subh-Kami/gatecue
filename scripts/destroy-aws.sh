#!/usr/bin/env bash
# Stops paying for the hosted GateCue: terminates the instance. Keeps the DynamoDB table, the IAM role and the
# release bucket (they cost nothing or almost nothing), so deploy-aws.sh can bring it back in minutes.
set -euo pipefail
export AWS_REGION="${AWS_REGION:-us-east-1}" AWS_DEFAULT_REGION="${AWS_REGION:-us-east-1}" AWS_PAGER=""
IDS=$(aws ec2 describe-instances --filters "Name=tag:Name,Values=gatecue" "Name=instance-state-name,Values=pending,running,stopped,stopping" \
  --query 'Reservations[].Instances[].InstanceId' --output text)
if [ -z "$IDS" ]; then echo "No GateCue instance running."; exit 0; fi
aws ec2 terminate-instances --instance-ids $IDS >/dev/null
echo "Terminating $IDS. Run scripts/deploy-aws.sh to bring GateCue back."
