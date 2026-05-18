#!/usr/bin/env bash

# Tokenometer production deploy script.
#
# Golden rule: this script must never operate inside /opt/ai-radar or any path
# containing ai-radar. Tokenometer is deployed as an isolated Docker Compose
# project named "tokenometer".

set -euo pipefail

BRANCH="${BRANCH:-main}"
COMPOSE_PROJECT="${COMPOSE_PROJECT:-tokenometer}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
EXPECTED_APP_NAME='"name": "tokenradar"'
TOKENOMETER_PORT="${TOKENOMETER_PORT:-3100}"
TOKENOMETER_PUBLIC_URL="${TOKENOMETER_PUBLIC_URL:-http://localhost:${TOKENOMETER_PORT}}"
SERVER_ACTION_ALLOWED_ORIGINS="${SERVER_ACTION_ALLOWED_ORIGINS:-localhost:${TOKENOMETER_PORT}}"

echo "Starting Tokenometer deployment..."

CURRENT_DIR="$(pwd -P)"
case "$CURRENT_DIR" in
  *ai-radar*|/opt/ai-radar|/opt/ai-radar/*)
    echo "ABORT: refusing to deploy Tokenometer from ai-radar path: $CURRENT_DIR" >&2
    exit 1
    ;;
esac

if [ ! -f package.json ] || ! grep -q "$EXPECTED_APP_NAME" package.json; then
  echo "ABORT: package.json does not look like Tokenometer/tokenradar." >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "ABORT: missing $COMPOSE_FILE." >&2
  exit 1
fi

touch .tokenometer-root

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -base64 32 | tr '+/' '-_' | tr -d '='
  else
    date +%s%N | sha256sum | awk '{print $1}'
  fi
}

ensure_env_value() {
  local key="$1"
  local value="$2"
  if ! grep -q "^${key}=" .env; then
    printf '%s="%s"\n' "$key" "$value" >> .env
  fi
}

if [ ! -f .env ]; then
  echo "Creating isolated Tokenometer .env..."
  : > .env
fi

ensure_env_value "INGEST_ENC_KEY" "$(random_secret)"
ensure_env_value "CRON_SECRET" "$(random_secret)"
ensure_env_value "POSTGRES_PASSWORD" "$(random_secret)"
ensure_env_value "NEXT_PUBLIC_APP_URL" "$TOKENOMETER_PUBLIC_URL"
ensure_env_value "SERVER_ACTION_ALLOWED_ORIGINS" "$SERVER_ACTION_ALLOWED_ORIGINS"

echo "Fetching latest code..."
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "Validating Docker Compose config..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" config >/dev/null

echo "Building Tokenometer image..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" build app

echo "Starting database..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d postgres

echo "Applying Prisma schema..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" run --rm app npx prisma db push

echo "Starting Tokenometer app..."
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" up -d --remove-orphans

echo "Pruning unused Docker images..."
docker image prune -f >/dev/null

echo "Container status:"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" ps

echo "Recent Tokenometer logs:"
docker compose -p "$COMPOSE_PROJECT" -f "$COMPOSE_FILE" logs --tail=80 app

echo "Deployment complete. Tokenometer should be available on host port ${TOKENOMETER_PORT}."
