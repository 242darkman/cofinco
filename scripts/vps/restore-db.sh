#!/usr/bin/env bash
# ==========================================================
# Cofinco — PostgreSQL Restore (VPS natif)
# ==========================================================
# Usage :
#   bash scripts/vps/restore-db.sh <backup-file>
#   bash scripts/vps/restore-db.sh /opt/cofinco/backups/cofinco_2026-02-24_020000.sql.gz
#
# ATTENTION : Cette opération REMPLACE toutes les données !
# Assurez-vous d'avoir un backup récent avant de restaurer.
#
# Options :
#   --confirm     Skip confirmation prompt
#   --target DB   Restore to a different database (for testing)
# ==========================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────
PG_DB="${PG_DB:-cofinco}"
PG_USER="${PG_USER:-cofinco_app}"
PG_HOST="${PG_HOST:-localhost}"
PG_PORT="${PG_PORT:-5432}"

# ── Arguments ────────────────────────────────────────────
BACKUP_FILE=""
CONFIRM=false
TARGET_DB="$PG_DB"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) CONFIRM=true; shift ;;
    --target) TARGET_DB="$2"; shift 2 ;;
    *) BACKUP_FILE="$1"; shift ;;
  esac
done

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: restore-db.sh <backup-file> [--confirm] [--target DB]"
  echo ""
  echo "Available backups:"
  ls -lht /opt/cofinco/backups/*.sql.gz* 2>/dev/null | head -10 || echo "  No backups found"
  exit 1
fi

# ── Validation ───────────────────────────────────────────
[ -f "$BACKUP_FILE" ] || { echo "ERROR: File not found: $BACKUP_FILE"; exit 1; }
command -v pg_restore >/dev/null || { echo "ERROR: pg_restore not found"; exit 1; }

echo "=========================================="
echo "  RESTORE POSTGRESQL DATABASE"
echo "=========================================="
echo ""
echo "  Backup:  $BACKUP_FILE"
echo "  Target:  $TARGET_DB"
echo "  Host:    $PG_HOST:$PG_PORT"
echo "  User:    $PG_USER"
echo ""

# Decrypt if GPG encrypted
RESTORE_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gpg ]]; then
  echo "Decrypting backup..."
  RESTORE_FILE="${BACKUP_FILE%.gpg}"
  gpg --batch --yes --decrypt --output "$RESTORE_FILE" "$BACKUP_FILE"
fi

# ── Confirmation ─────────────────────────────────────────
if [ "$CONFIRM" = "false" ]; then
  echo -e "\033[1;31mATTENTION: Ceci va REMPLACER toutes les données de '$TARGET_DB'!\033[0m"
  echo ""
  read -r -p "Tapez le nom de la base pour confirmer [$TARGET_DB]: " CONFIRM_DB
  if [ "$CONFIRM_DB" != "$TARGET_DB" ]; then
    echo "Annulé."
    exit 1
  fi
fi

echo ""
echo "Restoring..."

# ── Decompress if gzipped ────────────────────────────────
if [[ "$RESTORE_FILE" == *.gz ]]; then
  TEMP_FILE="/tmp/cofinco_restore_$$.dump"
  gunzip -c "$RESTORE_FILE" > "$TEMP_FILE"
  RESTORE_FILE="$TEMP_FILE"
fi

# ── Restore ──────────────────────────────────────────────
# Drop existing connections
psql -h "$PG_HOST" -p "$PG_PORT" -U postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$TARGET_DB' AND pid <> pg_backend_pid();" \
  2>/dev/null || true

# Restore with pg_restore (custom format)
pg_restore \
  -h "$PG_HOST" \
  -p "$PG_PORT" \
  -U "$PG_USER" \
  -d "$TARGET_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "$RESTORE_FILE" 2>&1 || echo "WARNING: Some restore warnings (check above)"

# Cleanup temp file
[ -n "${TEMP_FILE:-}" ] && rm -f "$TEMP_FILE"

echo ""
echo "=========================================="
echo "  RESTORE COMPLETE"
echo "=========================================="
echo ""
echo "Vérification rapide:"
echo "  psql -h $PG_HOST -p $PG_PORT -U $PG_USER -d $TARGET_DB -c 'SELECT count(*) FROM users;'"
echo ""
