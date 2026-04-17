#!/usr/bin/env bash
# One-command start: generate keys, template configs, docker compose up, wait, register.
set -euo pipefail

DIR="$(cd "$(dirname "$0")/.." && pwd)"
SCRIPTS="$DIR/scripts"

# 1. Generate keys if missing
if [ ! -f "$DIR/.env" ]; then
  echo "==> Generating Ed25519 keys..."
  bash "$SCRIPTS/generate-keys.sh"
fi

# shellcheck disable=SC1091
source "$DIR/.env"
export BAP_PRIVATE_KEY BAP_PUBLIC_KEY
export BPP_ALPHA_PRIVATE_KEY BPP_ALPHA_PUBLIC_KEY
export BPP_BETA_PRIVATE_KEY BPP_BETA_PUBLIC_KEY
export BPP_GAMMA_PRIVATE_KEY BPP_GAMMA_PUBLIC_KEY

# 2. Template onix configs (replace ${VAR} placeholders with actual keys)
echo "==> Templating onix configs..."
RENDERED="$DIR/onix-config-rendered"
mkdir -p "$RENDERED"
for f in "$DIR"/onix-config/*.yaml; do
  envsubst < "$f" > "$RENDERED/$(basename "$f")"
done

# 3. Start all containers
echo "==> Starting Docker Compose..."
cd "$DIR"
docker compose up -d --build

# 4. Wait for registry
echo "==> Waiting for registry..."
bash "$SCRIPTS/wait-for-registry.sh"

# 5. Register subscribers
echo "==> Registering subscribers..."
bash "$SCRIPTS/register-subscribers.sh"

echo ""
echo "==> Infrastructure ready!"
echo "    Registry:  http://localhost:3030"
echo "    Gateway:   http://localhost:4030"
echo "    Onix BAP:  http://localhost:8081"
echo "    BPP Alpha: http://localhost:9001 (via onix: 8082)"
echo "    BPP Beta:  http://localhost:9002 (via onix: 8083)"
echo "    BPP Gamma: http://localhost:9003 (via onix: 8084)"
echo "    Ledger:    http://localhost:8090"
echo ""
echo "    Start BAP with: pnpm dev:live"
