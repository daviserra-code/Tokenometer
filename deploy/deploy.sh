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

echo "Deployment complete. Tokenometer should be available on host port ${TOKENOMETER_PORT:-3100}."
