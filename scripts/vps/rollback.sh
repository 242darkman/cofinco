#!/usr/bin/env bash
# ==========================================================
# Cofinco — Rollback Script (VPS)
# ==========================================================
# Usage :
#   bash scripts/vps/rollback.sh              # rollback au tag précédent
#   bash scripts/vps/rollback.sh v3.60.0      # rollback à un tag spécifique
#
# Ce script :
#   1. Détermine le tag précédent (ou utilise celui fourni)
#   2. Met à jour APP_VERSION dans .env.runtime
#   3. Redéploie les containers avec l'ancien tag
#   4. Vérifie la santé
# ==========================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────
APP_DIR="/opt/cofinco"
ENV_FILE="$APP_DIR/env/.env.runtime"
COMPOSE_FILE="$APP_DIR/docker-compose.vps.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"
LOG_FILE="$APP_DIR/logs/deploy.log"
PREVIOUS_TAG_FILE="$APP_DIR/env/.previous-tag"

# ── Fonctions ────────────────────────────────────────────
log() {
  local msg="[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ROLLBACK: $*"
  echo "$msg"
  echo "$msg" >> "$LOG_FILE" 2>/dev/null || true
}

die() {
  log "FATAL: $*"
  exit 1
}

# ── Déterminer le tag cible ──────────────────────────────
if [ -n "${1:-}" ]; then
  TARGET_TAG="$1"
  log "Rolling back to specified tag: $TARGET_TAG"
else
  [ -f "$PREVIOUS_TAG_FILE" ] || die "No previous tag file found: $PREVIOUS_TAG_FILE"
  TARGET_TAG=$(cat "$PREVIOUS_TAG_FILE")
  [ -n "$TARGET_TAG" ] || die "Previous tag file is empty"
  log "Rolling back to previous tag: $TARGET_TAG"
fi

# ── Validation ───────────────────────────────────────────
[ -f "$ENV_FILE" ] || die "Env file not found: $ENV_FILE"
[ -f "$COMPOSE_FILE" ] || die "Compose file not found: $COMPOSE_FILE"

CURRENT_TAG=$(grep "^APP_VERSION=" "$ENV_FILE" | cut -d= -f2 || echo "unknown")
log "Current tag: $CURRENT_TAG → Target: $TARGET_TAG"

if [ "$CURRENT_TAG" = "$TARGET_TAG" ]; then
  log "Already running $TARGET_TAG — nothing to do"
  exit 0
fi

log "=========================================="
log "ROLLBACK START: $CURRENT_TAG → $TARGET_TAG"
log "=========================================="

# ── Step 1: Update APP_VERSION ───────────────────────────
sed -i "s|^APP_VERSION=.*|APP_VERSION=$TARGET_TAG|" "$ENV_FILE"
log "APP_VERSION set to $TARGET_TAG"

# ── Step 2: Pull target images ──────────────────────────
log "Pulling images for tag: $TARGET_TAG"
$COMPOSE_CMD pull app worker 2>&1 | while read -r line; do log "  $line"; done

# ── Step 3: Restart containers ──────────────────────────
# Note: No DB init on rollback (schema should be backwards-compatible)
log "Restarting containers..."
$COMPOSE_CMD up -d --remove-orphans 2>&1 | while read -r line; do log "  $line"; done

# ── Step 4: Health check ────────────────────────────────
log "Waiting for health check..."

MAX_ATTEMPTS=20
ATTEMPT=0
HEALTHY=false

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
  ATTEMPT=$((ATTEMPT + 1))
  sleep 3

  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:5001/api/health --max-time 5 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" = "200" ]; then
    HEALTHY=true
    log "Health check passed (attempt $ATTEMPT/$MAX_ATTEMPTS)"
    break
  fi

  log "Health check attempt $ATTEMPT/$MAX_ATTEMPTS: HTTP $HTTP_CODE"
done

if [ "$HEALTHY" = "false" ]; then
  die "Rollback health check failed — MANUAL INTERVENTION REQUIRED"
fi

# Save the rollback tag
echo "$TARGET_TAG" > "$PREVIOUS_TAG_FILE"

log "=========================================="
log "ROLLBACK SUCCESS: now running $TARGET_TAG"
log "=========================================="
