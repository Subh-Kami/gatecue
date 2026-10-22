#!/usr/bin/env bash
# Start the GateCue MCP server in demo mode (scenario clock) in the background.
# Stops any older GateCue server on the same port first, so a fresh build is always what you see.
cd "$(dirname "$0")/.."
PORT="${PORT:-8787}"
LOG="${LOG:-/tmp/gatecue-server.log}"
OLD=$(lsof -ti tcp:"$PORT" 2>/dev/null)
if [ -n "$OLD" ]; then echo "Stopping old server on port $PORT (pid $OLD)"; kill $OLD 2>/dev/null; sleep 1; fi
PORT="$PORT" GATECUE_DEMO_NOW="${GATECUE_DEMO_NOW:-2026-10-15T05:30:00-07:00}" GATECUE_DEMO_SPEEDUP="${GATECUE_DEMO_SPEEDUP:-1}" GC_AWS="${GC_AWS:-1}" GATECUE_SCHEDULE="${GATECUE_SCHEDULE:-demo}" \
  nohup npx tsx --env-file-if-exists=.env server/index.ts > "$LOG" 2>&1 &
for i in $(seq 1 20); do
  if curl -s "http://localhost:$PORT/healthz" >/dev/null 2>&1; then echo "GateCue is running. Open http://localhost:$PORT/sim/"; exit 0; fi
  sleep 0.5
done
echo "Server did not start. Last log lines:"; tail -20 "$LOG"; exit 1
