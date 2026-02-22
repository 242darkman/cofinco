#!/usr/bin/env bash
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.production}"
if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

COMPOSE_FILE="${COMPOSE_FILE:-$PROJECT_DIR/docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
MINIO_VOLUME="${MINIO_VOLUME:-cofinco_minio_data}"

# ============================================
# Auto-detect environment: Docker vs Native
# ============================================
# Override: FORCE_DOCKER=true or FORCE_NATIVE=true
DOCKER_MODE=""

detect_environment() {
  if [ "${FORCE_DOCKER:-}" = "true" ]; then
    DOCKER_MODE="docker"
    return
  fi
  if [ "${FORCE_NATIVE:-}" = "true" ]; then
    DOCKER_MODE="native"
    return
  fi

  # Check if docker is available and the db container is running
  if command -v docker >/dev/null 2>&1; then
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -qE 'cofinco.*db|cofinco-db'; then
      DOCKER_MODE="docker"
      return
    fi
  fi

  # Fallback: check if pg_dump is available locally
  if command -v pg_dump >/dev/null 2>&1; then
    DOCKER_MODE="native"
    return
  fi

  echo "ERROR: Neither Docker (with running db container) nor local pg_dump found."
  exit 1
}

detect_environment

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN=(docker-compose)
else
  COMPOSE_BIN=(docker compose)
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WORK_DIR="$BACKUP_DIR/tmp_$TIMESTAMP"
ARCHIVE_BASENAME="cofinco-backup-$TIMESTAMP.tar.gz"
ARCHIVE_PATH="$BACKUP_DIR/$ARCHIVE_BASENAME"

mkdir -p "$WORK_DIR"

echo "=== Cofinco Backup ==="
echo "Mode:      $DOCKER_MODE"
echo "Timestamp: $TIMESTAMP"
echo "Retention: $RETENTION_DAYS days"
echo ""

# ============================================
# PostgreSQL Dump
# ============================================
echo "Dumping Postgres ($DOCKER_MODE)..."

if [ "$DOCKER_MODE" = "docker" ]; then
  "${COMPOSE_BIN[@]}" -f "$COMPOSE_FILE" exec -T db pg_dump -U "${POSTGRES_USER:?}" -F c "${POSTGRES_DB:?}" > "$WORK_DIR/postgres.dump"
else
  PGHOST="${POSTGRES_HOST:-localhost}"
  PGPORT="${POSTGRES_PORT:-5432}"
  PGPASSWORD="${POSTGRES_PASSWORD:?}" pg_dump \
    -h "$PGHOST" \
    -p "$PGPORT" \
    -U "${POSTGRES_USER:?}" \
    -F c \
    "${POSTGRES_DB:?}" > "$WORK_DIR/postgres.dump"
fi

echo "  Done ($(du -h "$WORK_DIR/postgres.dump" | cut -f1))"

# ============================================
# MinIO Data Archive
# ============================================
echo "Archiving MinIO data..."

if [ "$DOCKER_MODE" = "docker" ] && docker volume inspect "$MINIO_VOLUME" >/dev/null 2>&1; then
  docker run --rm -v "$MINIO_VOLUME":/data -v "$WORK_DIR":/backup alpine:3.20 sh -c "tar -czf /backup/minio.tar.gz -C /data ."
  echo "  Done ($(du -h "$WORK_DIR/minio.tar.gz" | cut -f1))"
elif [ -d "${MINIO_DATA_DIR:-/dev/null}" ]; then
  tar -czf "$WORK_DIR/minio.tar.gz" -C "$MINIO_DATA_DIR" .
  echo "  Done ($(du -h "$WORK_DIR/minio.tar.gz" | cut -f1))"
else
  echo "  Skipped (MinIO volume/directory not found)"
fi

# ============================================
# Create combined archive
# ============================================
echo "Creating combined archive..."
tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" .

FINAL_PATH="$ARCHIVE_PATH"

# Optional GPG encryption
if [ -n "${GPG_RECIPIENT:-}" ]; then
  gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" --output "$ARCHIVE_PATH.gpg" "$ARCHIVE_PATH"
  rm -f "$ARCHIVE_PATH"
  FINAL_PATH="$ARCHIVE_PATH.gpg"
  echo "  Encrypted (GPG recipient)"
elif [ -n "${GPG_PASSPHRASE:-}" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$GPG_PASSPHRASE" --output "$ARCHIVE_PATH.gpg" "$ARCHIVE_PATH"
  rm -f "$ARCHIVE_PATH"
  FINAL_PATH="$ARCHIVE_PATH.gpg"
  echo "  Encrypted (GPG symmetric)"
fi

rm -rf "$WORK_DIR"

# Optional S3 remote upload
if [ -n "${BACKUP_S3_URI:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "Uploading to S3..."
    aws s3 cp "$FINAL_PATH" "$BACKUP_S3_URI/"
    echo "  Done"
  else
    echo "  aws cli not found; skipping remote upload."
  fi
fi

# Cleanup old backups
find "$BACKUP_DIR" -maxdepth 1 -type f -name "cofinco-backup-*.tar.gz*" -mtime +"$RETENTION_DAYS" -print -delete
# Also clean legacy format
find "$BACKUP_DIR" -maxdepth 1 -type f -name "asset-tracker-backup-*.tar.gz*" -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null || true

echo ""
echo "=== Backup complete ==="
echo "File: $FINAL_PATH"
echo "Size: $(du -h "$FINAL_PATH" | cut -f1)"
