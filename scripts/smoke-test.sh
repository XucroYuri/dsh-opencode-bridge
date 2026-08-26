#!/usr/bin/env bash
# Smoke test for all DSH plugins.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Checking git status"
for p in dsh-opencode-sync dsh-provider-catalog dsh-model-manager dsh-llm-oauth-ui dsh-opencode-bridge; do
  if [ -n "$(git -C "$p" status --porcelain)" ]; then
    echo "FAIL: $p has uncommitted changes"
    exit 1
  fi
  echo "OK: $p clean"
done

echo "==> Checking JS syntax"
for p in dsh-opencode-sync dsh-provider-catalog dsh-model-manager dsh-llm-oauth-ui dsh-opencode-bridge; do
  (cd "$p" && node --check src/index.js)
  for f in "$p"/bin/*.js; do [ -e "$f" ] && node --check "$f"; done
  echo "OK: $p syntax"
done

echo "==> Running Python tests"
for p in dsh-opencode-sync dsh-provider-catalog dsh-model-manager dsh-llm-oauth-ui dsh-opencode-bridge; do
  (cd "$p" && PYTHONPATH=src python3 -m unittest discover -s tests -p 'test_*.py' >/dev/null)
  echo "OK: $p tests"
done

echo "==> All smoke tests passed"
