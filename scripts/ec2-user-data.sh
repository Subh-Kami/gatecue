#!/bin/bash
# First boot of the GateCue instance (Amazon Linux 2023, arm64). deploy-aws.sh fills in __BUCKET__, __REGION__, __TABLE__.
# Installs Node 22 and Caddy, fetches the app from S3, builds it, and runs it behind HTTPS on <public-ip>.sslip.io.
set -euxo pipefail
exec > >(tee /var/log/gatecue-setup.log) 2>&1

# 1 GB swap: npm install and the card build are comfortable on a 1 GB instance with it.
if [ ! -f /swapfile ]; then fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile swap swap defaults 0 0' >> /etc/fstab; fi

dnf install -y tar xz
cd /opt
NODE=$(curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt | grep -o 'node-v22[^ ]*-linux-arm64\.tar\.xz' | head -1)
curl -fsSLO "https://nodejs.org/dist/latest-v22.x/$NODE"
tar -xJf "$NODE" && ln -sfn "/opt/${NODE%.tar.xz}" /opt/node && rm -f "$NODE"
curl -fsSL "https://caddyserver.com/api/download?os=linux&arch=arm64" -o /usr/local/bin/caddy && chmod +x /usr/local/bin/caddy
useradd --system --create-home --home-dir /opt/gatecue gatecue || true
mkdir -p /var/lib/caddy /etc/caddy

# gatecue-config: settings derived from the instance's current public IP (it changes if the instance is stopped and
# started), so it runs on every update. Public demo settings: scenario clock and demo schedule, real AWS services,
# no email (it would only reach the owner's inbox), Amazon Nova on Bedrock as the brain (capped per minute and per day;
# set GC_BRAIN=scripted in /etc/gatecue.extra to switch the model off).
cat > /usr/local/bin/gatecue-config <<'EOF'
#!/bin/bash
set -euo pipefail
TOKEN=$(curl -fsS -X PUT http://169.254.169.254/latest/api/token -H "X-aws-ec2-metadata-token-ttl-seconds: 300")
IP=$(curl -fsS -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4)
HOST="$(echo "$IP" | tr . -).sslip.io"
cat > /etc/gatecue.env <<ENV
PORT=8787
PUBLIC_BASE_URL=https://$HOST
AWS_REGION=__REGION__
GC_AWS=1
GC_MEMORY_TABLE=__TABLE__
GC_USER=public-demo
GATECUE_DEMO_NOW=2026-10-15T05:30:00-07:00
GATECUE_DEMO_SPEEDUP=1
GATECUE_SCHEDULE=demo
GC_BRAIN=bedrock
GC_AGENT_PER_DAY=2000
NODE_ENV=production
PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
ENV
# Owner overrides (e.g. GC_BRAIN=scripted) live here and survive updates.
[ -f /etc/gatecue.extra ] && cat /etc/gatecue.extra >> /etc/gatecue.env
cat > /etc/systemd/system/caddy.service <<UNIT
[Unit]
Description=Caddy (HTTPS for GateCue)
After=network-online.target
Wants=network-online.target

[Service]
Environment=XDG_DATA_HOME=/var/lib/caddy XDG_CONFIG_HOME=/etc/caddy
ExecStart=/usr/local/bin/caddy reverse-proxy --from $HOST --to localhost:8787
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
echo "$HOST"
EOF
chmod +x /usr/local/bin/gatecue-config

# gatecue-update: fetch the latest release from S3, install, build, restart. Run by deploy-aws.sh through SSM.
cat > /usr/local/bin/gatecue-update <<'EOF'
#!/bin/bash
set -euo pipefail
export PATH=/opt/node/bin:$PATH PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm_config_update_notifier=false HOME=/root
HOST=$(/usr/local/bin/gatecue-config)
REL=/opt/gatecue/release-$(date +%s)
mkdir -p "$REL"
aws s3 cp s3://__BUCKET__/app.tgz /tmp/app.tgz --region __REGION__ --only-show-errors
tar -xzf /tmp/app.tgz -C "$REL"
cd "$REL"
npm ci --no-audit --no-fund
npm run build
chown -R gatecue:gatecue "$REL"
ln -sfn "$REL" /opt/gatecue/app
systemctl restart gatecue
systemctl restart caddy
ls -dt /opt/gatecue/release-* | tail -n +3 | xargs -r rm -rf   # keep the two newest releases
echo "GateCue updated: https://$HOST/sim/ ($REL)"
EOF
chmod +x /usr/local/bin/gatecue-update

cat > /etc/systemd/system/gatecue.service <<'EOF'
[Unit]
Description=GateCue MCP server and Alexa+ simulator
After=network-online.target
Wants=network-online.target

[Service]
User=gatecue
WorkingDirectory=/opt/gatecue/app
EnvironmentFile=/etc/gatecue.env
ExecStart=/opt/node/bin/node --import tsx server/index.ts
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
/usr/local/bin/gatecue-update
systemctl enable gatecue caddy
echo "GateCue setup done."
