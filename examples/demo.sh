#!/usr/bin/env bash
# End-to-end demo: OpenCode Bridge -> OpenAI-compatible proxy -> DSH model call.
set -euo pipefail

PROXY_PORT="${PROXY_PORT:-4097}"
OPENCODE_PORT="${OPENCODE_PORT:-4096}"
MODEL="${MODEL:-opencode/x-preview-f-free}"

echo "==> Starting OpenCode server"
dsh --profile tools opencode-bridge serve --port "$OPENCODE_PORT"

echo "==> Starting OpenAI-compatible proxy"
dsh --profile tools opencode-bridge proxy --port "$PROXY_PORT" --opencode-port "$OPENCODE_PORT" &
PROXY_PID=$!
trap 'kill $PROXY_PID 2>/dev/null || true' EXIT
sleep 2

echo "==> Testing proxy with curl"
curl -sS -X POST "http://127.0.0.1:${PROXY_PORT}/v1/chat/completions" \
  -H 'Content-Type: application/json' \
  -d "{\"model\":\"$MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"say hi\"}],\"stream\":false}"
echo

echo "==> Demo complete"
