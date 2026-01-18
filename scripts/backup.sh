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

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_BIN=(docker-compose)
else
  COMPOSE_BIN=(docker compose)
fi

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
WORK_DIR="$BACKUP_DIR/tmp_$TIMESTAMP"
ARCHIVE_BASENAME="asset-tracker-backup-$TIMESTAMP.tar.gz"
ARCHIVE_PATH="$BACKUP_DIR/$ARCHIVE_BASENAME"

mkdir -p "$WORK_DIR"

echo "Starting backup at $TIMESTAMP"

echo "Dumping Postgres..."
"${COMPOSE_BIN[@]}" -f "$COMPOSE_FILE" exec -T db pg_dump -U "${POSTGRES_USER:?}" -F c "${POSTGRES_DB:?}" > "$WORK_DIR/postgres.dump"

echo "Archiving MinIO data..."
docker run --rm -v "$MINIO_VOLUME":/data -v "$WORK_DIR":/backup alpine:3.20 sh -c "tar -czf /backup/minio.tar.gz -C /data ."

echo "Creating combined archive..."
tar -czf "$ARCHIVE_PATH" -C "$WORK_DIR" .

FINAL_PATH="$ARCHIVE_PATH"

if [ -n "${GPG_RECIPIENT:-}" ]; then
  gpg --batch --yes --encrypt --recipient "$GPG_RECIPIENT" --output "$ARCHIVE_PATH.gpg" "$ARCHIVE_PATH"
  rm -f "$ARCHIVE_PATH"
  FINAL_PATH="$ARCHIVE_PATH.gpg"
elif [ -n "${GPG_PASSPHRASE:-}" ]; then
  gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "$GPG_PASSPHRASE" --output "$ARCHIVE_PATH.gpg" "$ARCHIVE_PATH"
  rm -f "$ARCHIVE_PATH"
  FINAL_PATH="$ARCHIVE_PATH.gpg"
fi

rm -rf "$WORK_DIR"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    aws s3 cp "$FINAL_PATH" "$BACKUP_S3_URI/"
  else
    echo "aws cli not found; skipping remote upload."
  fi
fi

find "$BACKUP_DIR" -maxdepth 1 -type f -name "asset-tracker-backup-*.tar.gz*" -mtime +"$RETENTION_DAYS" -print -delete

echo "Backup done: $FINAL_PATH"
