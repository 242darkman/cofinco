#!/usr/bin/env bash
# ==========================================================
# Cofinco — PostgreSQL Backup (VPS natif)
# ==========================================================
# Usage :
#   bash scripts/vps/backup-db.sh
#
# Configuré automatiquement via systemd timer (cofinco-backup.timer)
# Exécuté quotidiennement à 02:00 UTC.
#
# Options (via variables d'environnement) :
#   PG_DB           Database name (default: cofinco)
#   PG_USER         Database user (default: cofinco_app)
#   PG_HOST         Database host (default: localhost)
#   PG_PORT         Database port (default: 5432)
#   BACKUP_DIR      Backup directory (default: /opt/cofinco/backups)
#   RETENTION_DAILY Number of daily backups to keep (default: 7)
#   RETENTION_WEEKLY Number of weekly backups to keep (default: 4)
#   GPG_RECIPIENT   GPG key ID for encryption (optional)
#   S3_BUCKET       S3 bucket for offsite backup (optional)
#   S3_ENDPOINT     S3 endpoint URL (optional, for MinIO)
# ==========================================================

set -euo pipefail
umask 077

# ── Configuration ────────────────────────────────────────
PG_DB="${PG_DB:-cofinco}"
PG_USER="${PG_USER:-cofinco_app}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-/opt/cofinco/backups}"
RETENTION_DAILY="${RETENTION_DAILY:-7}"
RETENTION_WEEKLY="${RETENTION_WEEKLY:-4}"

TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DAY_OF_WEEK="$(date +%u)"  # 1=Mon, 7=Sun
BACKUP_FILE="$BACKUP_DIR/${PG_DB}_${TIMESTAMP}.sql.gz"
WEEKLY_DIR="$BACKUP_DIR/weekly"

# ── Fonctions ────────────────────────────────────────────
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] BACKUP: $*"
}

die() {
  log "FATAL: $*"
  exit 1
}

# ── Validation ───────────────────────────────────────────
command -v pg_dump >/dev/null || die "pg_dump not found"
mkdir -p "$BACKUP_DIR"
mkdir -p "$WEEKLY_DIR"

log "=========================================="
log "Starting backup: $PG_DB"
log "=========================================="

# ── Step 1: pg_dump ──────────────────────────────────────
log "Running pg_dump..."
pg_dump \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_USER" \
  -F custom \
  "$PG_DB" | gzip > "$BACKUP_FILE"

# Verify non-zero file
FILESIZE=$(stat -f%z "$BACKUP_FILE" 2>/dev/null || stat -c%s "$BACKUP_FILE" 2>/dev/null || echo "0")
if [ "$FILESIZE" -lt 1024 ]; then
  die "Backup file is suspiciously small ($FILESIZE bytes): $BACKUP_FILE"
fi

log "Backup created: $BACKUP_FILE ($FILESIZE bytes)"

# ── Step 2: Weekly copy (Sunday) ─────────────────────────
if [ "$DAY_OF_WEEK" = "7" ]; then
  WEEKLY_FILE="$WEEKLY_DIR/${PG_DB}_week_$(date +%Y-W%V).sql.gz"
  cp "$BACKUP_FILE" "$WEEKLY_FILE"
  log "Weekly copy: $WEEKLY_FILE"
fi

# ── Step 3: Optional GPG encryption ─────────────────────
if [ -n "${GPG_RECIPIENT:-}" ]; then
  log "Encrypting with GPG..."
  gpg --batch --yes --trust-model always \
    --encrypt --recipient "$GPG_RECIPIENT" \
    --output "$BACKUP_FILE.gpg" "$BACKUP_FILE"
  rm -f "$BACKUP_FILE"
  BACKUP_FILE="$BACKUP_FILE.gpg"
  log "Encrypted: $BACKUP_FILE"
fi

# ── Step 4: Optional S3 offsite upload ───────────────────
if [ -n "${S3_BUCKET:-}" ]; then
  S3_OPTS=""
  if [ -n "${S3_ENDPOINT:-}" ]; then
    S3_OPTS="--endpoint-url $S3_ENDPOINT"
  fi

  if command -v aws >/dev/null 2>&1; then
    log "Uploading to S3: $S3_BUCKET"
    aws s3 cp $S3_OPTS "$BACKUP_FILE" "s3://$S3_BUCKET/backups/daily/$(basename "$BACKUP_FILE")"

    if [ "$DAY_OF_WEEK" = "7" ] && [ -f "${WEEKLY_FILE:-}" ]; then
      aws s3 cp $S3_OPTS "$WEEKLY_FILE" "s3://$S3_BUCKET/backups/weekly/$(basename "$WEEKLY_FILE")"
    fi

    log "S3 upload complete"
  else
    log "WARNING: aws CLI not found — skipping S3 upload"
  fi
fi

# ── Step 5: Rotation (cleanup old backups) ───────────────
log "Rotating old backups..."

# Daily: keep last N days
DAILY_DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PG_DB}_*.sql.gz*" -mtime +"$RETENTION_DAILY" -print -delete | wc -l)
log "  Daily: deleted $DAILY_DELETED old backups (retention: $RETENTION_DAILY days)"

# Weekly: keep last N weeks
WEEKLY_DAYS=$((RETENTION_WEEKLY * 7))
WEEKLY_DELETED=$(find "$WEEKLY_DIR" -maxdepth 1 -type f -name "${PG_DB}_*.sql.gz*" -mtime +"$WEEKLY_DAYS" -print -delete | wc -l)
log "  Weekly: deleted $WEEKLY_DELETED old backups (retention: $RETENTION_WEEKLY weeks)"

# ── Step 6: Summary ─────────────────────────────────────
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" 2>/dev/null | cut -f1)
BACKUP_COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${PG_DB}_*.sql.gz*" | wc -l)
WEEKLY_COUNT=$(find "$WEEKLY_DIR" -maxdepth 1 -type f -name "${PG_DB}_*.sql.gz*" | wc -l)

log "=========================================="
log "Backup complete"
log "  File:     $(basename "$BACKUP_FILE")"
log "  Size:     $FILESIZE bytes"
log "  Daily:    $BACKUP_COUNT backups"
log "  Weekly:   $WEEKLY_COUNT backups"
log "  Total:    $TOTAL_SIZE"
log "=========================================="
