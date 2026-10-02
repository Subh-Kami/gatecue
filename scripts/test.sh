#!/usr/bin/env bash
# Unit tests, then the end-to-end MCP test against a fresh keyless demo server on its own port.
set -e
cd "$(dirname "$0")/.."
npx tsx tests/plan.test.ts
PORT=8797
PORT=$PORT GATECUE_DEMO_NOW=2026-10-15T05:30:00-07:00 GATECUE_DEMO_SPEEDUP=60 GATECUE_SCHEDULE=demo GC_AWS=0 \
  RAPIDAPI_KEY= STRIPE_SECRET_KEY= ANTHROPIC_API_KEY= GC_BRAIN=scripted npx tsx server/index.ts > /tmp/gatecue-test-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 40); do curl -s "http://localhost:$PORT/healthz" >/dev/null 2>&1 && break; sleep 0.25; done
BASE="http://localhost:$PORT" npx tsx tests/e2e-client.ts
