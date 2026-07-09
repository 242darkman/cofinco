#!/usr/bin/env bash
# ==========================================================
# MicroFlex — Deploy Script (VPS, idempotent)
# ==========================================================
# Usage :
#   bash scripts/vps/deploy.sh <tag>
#   bash scripts/vps/deploy.sh v3.61.0
#   bash scripts/vps/deploy.sh rc-v3.62.0
#
# Prérequis :
#   - /opt/microflex/env/.env.runtime existe (généré par CI/CD)
#   - Docker + docker compose installés
#   - Accès GHCR (docker login ghcr.io)
#   - PostgreSQL natif accessible
#
# Ce script est IDEMPOTENT : relancer ne casse rien.
# ==========================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────
APP_DIR="/opt/microflex"
ENV_FILE="$APP_DIR/env/.env.runtime"
COMPOSE_FILE="$APP_DIR/docker-compose.vps.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"
LOG_FILE="$APP_DIR/logs/deploy.log"
PREVIOUS_TAG_FILE="$APP_DIR/env/.previous-tag"

# ── Arguments ────────────────────────────────────────────
TAG="${1:?Usage: deploy.sh <tag> (e.g., v3.61.0)}"

# ── Fonctions ────────────────────────────────────────────
log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

die() {
  log "FATAL: $*"
  exit 1
}

# ── Validation ───────────────────────────────────────────
[ -f "$ENV_FILE" ] || die "Env file not found: $ENV_FILE"
[ -f "$COMPOSE_FILE" ] || die "Compose file not found: $COMPOSE_FILE"
command -v docker >/dev/null || die "Docker not found"

mkdir -p "$APP_DIR/logs"

log "=========================================="
log "DEPLOY START: tag=$TAG"
log "=========================================="

# ── Step 1: Save current tag for rollback ────────────────
CURRENT_TAG=""
if [ -f "$PREVIOUS_TAG_FILE" ]; then
  CURRENT_TAG=$(cat "$PREVIOUS_TAG_FILE" 2>/dev/null || echo "")
fi

# Get the tag currently running (from container labels or env)
RUNNING_TAG=$($COMPOSE_CMD exec -T app printenv APP_VERSION 2>/dev/null || echo "$CURRENT_TAG")
if [ -n "$RUNNING_TAG" ] && [ "$RUNNING_TAG" != "$TAG" ]; then
  echo "$RUNNING_TAG" > "$PREVIOUS_TAG_FILE"
  log "Previous tag saved: $RUNNING_TAG"
fi

# ── Step 2: Update APP_VERSION in env file ───────────────
# Replace APP_VERSION line in .env.runtime
if grep -q "^APP_VERSION=" "$ENV_FILE"; then
  sed -i "s|^APP_VERSION=.*|APP_VERSION=$TAG|" "$ENV_FILE"
else
  echo "APP_VERSION=$TAG" >> "$ENV_FILE"
fi
log "APP_VERSION set to $TAG in env file"

# ── Step 3: Login to registry ────────────────────────────
REGISTRY=$(grep "^REGISTRY=" "$ENV_FILE" | cut -d= -f2 || echo "ghcr.io")
log "Registry: $REGISTRY"

# Assume login is already done (deploy user has credentials)
# If not, uncomment:
# echo "$GHCR_TOKEN" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin

# ── Step 4: Pull images ─────────────────────────────────
log "Pulling images for tag: $TAG"
$COMPOSE_CMD pull app worker 2>&1 | while read -r line; do log "  $line"; done

# Pull init image
IMAGE_NAME=$(grep "^IMAGE_NAME=" "$ENV_FILE" | cut -d= -f2 || echo "microflex")
INIT_IMAGE="$REGISTRY/$IMAGE_NAME:$TAG-init"
log "Pulling init image: $INIT_IMAGE"
docker pull "$INIT_IMAGE" 2>&1 | while read -r line; do log "  $line"; done

# ── Step 5: Run DB init (schema push + seeds) ───────────
log "Running DB init (schema push + seeds)..."

# Read DATABASE_URL from env file (without exposing it in logs)
DB_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d= -f2-)

# With --network host, containers access host's localhost directly.
# Replace host.docker.internal with localhost for db-init.
DB_URL_LOCAL=$(echo "$DB_URL" | sed 's/host\.docker\.internal/localhost/g')

# Remove leftover init container from a previous failed deploy
docker rm -f microflex-db-init 2>/dev/null || true

# Persist GeoNames data (~1.6 GB) across deploys to avoid re-downloading
mkdir -p "$APP_DIR/data/geonames"

docker run --rm \
  --name microflex-db-init \
  --network host \
  -e "DATABASE_URL=$DB_URL_LOCAL" \
  -v "$APP_DIR/data/geonames:/geonames_cache" \
  "$INIT_IMAGE" \
  "cp /geonames_cache/*.txt /app/seeds/ 2>/dev/null || true; sh scripts/download-geonames.sh; cp /app/seeds/CG.txt /app/seeds/cities5000.txt /geonames_cache/ 2>/dev/null || true; npx drizzle-kit push --force && node --import tsx scripts/ensure-sql.ts && node --import tsx seeds/seed-prod.ts" \
  2>&1 | while read -r line; do log "  [db-init] $line"; done

INIT_EXIT=$?
if [ $INIT_EXIT -ne 0 ]; then
  log "WARNING: DB init exited with code $INIT_EXIT (may be normal if no schema changes)"
fi

log "DB init complete"

# ── Step 6: Deploy containers ───────────────────────────
log "Starting containers..."
$COMPOSE_CMD up -d --remove-orphans 2>&1 | while read -r line; do log "  $line"; done

# ── Step 7: Health check ────────────────────────────────
log "Waiting for health check..."

MAX_ATTEMPTS=30
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  sleep 2

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/api/health --max-time 5 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    HEALTHY=true
    log "Health check passed (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    break
  fi

  log "Health check attempt $ATTEMPT/$MAX_ATTEMPTS: HTTP $HTTP_CODE"
done

if [ "$HEALTHY" = "false" ]; then
  log "FATAL: Health check failed after $MAX_ATTEMPTS attempts"

  # Attempt auto-rollback
  if [ -n "$RUNNING_TAG" ] && [ "$RUNNING_TAG" != "$TAG" ]; then
    log "Attempting auto-rollback to $RUNNING_TAG..."
    bash "$APP_DIR/scripts/vps/rollback.sh" "$RUNNING_TAG" || true
  fi

  die "Deploy failed — health check timeout"
fi

# ── Step 8: Worker health check ─────────────────────────
log "Checking worker health..."
WORKER_HEALTHY=$($COMPOSE_CMD exec -T worker wget -q --spider http://localhost:5000/api/health 2>&1 && echo "yes" || echo "no")
if [ "$WORKER_HEALTHY" = "yes" ]; then
  log "Worker health check passed"
else
  log "WARNING: Worker health check failed (cron jobs may not be running)"
fi

# ── Step 9: Cleanup ─────────────────────────────────────
log "Cleaning up old images..."
docker image prune -f --filter "until=24h" 2>/dev/null || true

# Save successful tag
echo "$TAG" > "$PREVIOUS_TAG_FILE"

log "=========================================="
log "DEPLOY SUCCESS: tag=$TAG"
log "=========================================="
