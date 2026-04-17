#!/usr/bin/env bash
# Generate Ed25519 key pairs for BAP + 3 BPPs.
# Writes keys to infra/.env (gitignored).
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$DIR/.env"

generate_pair() {
  local name=$1
  local tmpkey
  tmpkey=$(mktemp)

  # Generate Ed25519 private key in PEM
  openssl genpkey -algorithm ed25519 -out "$tmpkey" 2>/dev/null

  # Extract raw private key (base64)
  local priv
  priv=$(openssl pkey -in "$tmpkey" -outform DER 2>/dev/null | tail -c 32 | base64)

  # Extract raw public key (base64)
  local pub
  pub=$(openssl pkey -in "$tmpkey" -pubout -outform DER 2>/dev/null | tail -c 32 | base64)

  rm -f "$tmpkey"

  echo "${name}_PRIVATE_KEY=$priv"
  echo "${name}_PUBLIC_KEY=$pub"
}

echo "Generating Ed25519 key pairs..."

{
  echo "# Auto-generated beckn-onix keys — do NOT commit"
  echo "# Generated at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo ""
  generate_pair "BAP"
  echo ""
  generate_pair "BPP_ALPHA"
  echo ""
  generate_pair "BPP_BETA"
  echo ""
  generate_pair "BPP_GAMMA"
} > "$ENV_FILE"

echo "Keys written to $ENV_FILE"
