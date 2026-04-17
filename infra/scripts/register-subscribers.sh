#!/usr/bin/env bash
# Register all 4 subscribers (BAP + 3 BPPs) in the local registry.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "No .env file found — run generate-keys.sh first."
  exit 1
fi

# shellcheck disable=SC1090
source "$ENV_FILE"

REGISTRY_URL="${REGISTRY_URL:-http://localhost:3030}"
COOKIE_JAR=$(mktemp)
trap 'rm -f "$COOKIE_JAR"' EXIT

# Login to the FIDE registry (required for /register endpoint)
echo "Logging into registry..."
curl -sf -c "$COOKIE_JAR" -X POST "$REGISTRY_URL/login/index" \
  -d "name=root&password=root" > /dev/null \
  && echo "Login OK" || { echo "Login FAILED"; exit 1; }

register() {
  local sub_id=$1
  local sub_url=$2
  local pub_key=$3
  local type=$4

  echo "Registering $sub_id ($type) ..."
  curl -sf -b "$COOKIE_JAR" -X POST "$REGISTRY_URL/register" \
    -H "Content-Type: application/json" \
    -d "{
      \"subscriber_id\": \"$sub_id\",
      \"subscriber_url\": \"$sub_url\",
      \"type\": \"$type\",
      \"domain\": \"dhp:diagnostics:0.1.0\",
      \"signing_public_key\": \"$pub_key\",
      \"status\": \"SUBSCRIBED\",
      \"city\": \"std:080\",
      \"country\": \"IND\"
    }" && echo " ✓" || echo " ✗ FAILED"
}

register "beckn-zk-bap" \
  "http://onix-bap:8081/bap/receiver/" \
  "$BAP_PUBLIC_KEY" \
  "BAP"

register "beckn-zk-bpp-lab-alpha" \
  "http://onix-bpp-alpha:8082/bpp/receiver/" \
  "$BPP_ALPHA_PUBLIC_KEY" \
  "BPP"

register "beckn-zk-bpp-lab-beta" \
  "http://onix-bpp-beta:8083/bpp/receiver/" \
  "$BPP_BETA_PUBLIC_KEY" \
  "BPP"

register "beckn-zk-bpp-lab-gamma" \
  "http://onix-bpp-gamma:8084/bpp/receiver/" \
  "$BPP_GAMMA_PUBLIC_KEY" \
  "BPP"

echo "Done."
