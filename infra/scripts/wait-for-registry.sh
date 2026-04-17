#!/usr/bin/env bash
# Poll registry health until it responds.
set -euo pipefail

REGISTRY_URL="${REGISTRY_URL:-http://localhost:3030}"
MAX_ATTEMPTS=30
SLEEP_SECONDS=2

echo "Waiting for registry at $REGISTRY_URL ..."

for i in $(seq 1 $MAX_ATTEMPTS); do
  if curl -sf "$REGISTRY_URL/subscribers" > /dev/null 2>&1; then
    echo "Registry is ready."
    exit 0
  fi
  echo "  attempt $i/$MAX_ATTEMPTS — not ready"
  sleep "$SLEEP_SECONDS"
done

echo "Registry did not become ready after $MAX_ATTEMPTS attempts."
exit 1
