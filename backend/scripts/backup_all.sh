#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="$ROOT_DIR/backups"
DB_BACKUP_DIR="$BACKUP_ROOT/db"
UPLOADS_BACKUP_DIR="$BACKUP_ROOT/uploads"
FULL_BACKUP_DIR="$BACKUP_ROOT/full"
DATE_TAG="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$FULL_BACKUP_DIR"

export BACKUP_DATE_TAG="$DATE_TAG"
/bin/bash "$ROOT_DIR/scripts/db_backup.sh"
/bin/bash "$ROOT_DIR/scripts/uploads_backup.sh"

DB_ARCHIVE="$DB_BACKUP_DIR/db_${DATE_TAG}.tar.gz"
UPLOADS_ARCHIVE="$UPLOADS_BACKUP_DIR/uploads_${DATE_TAG}.tar.gz"

if [[ ! -f "$DB_ARCHIVE" ]]; then
  echo "DB backup not found: $DB_ARCHIVE" >&2
  exit 1
fi

if [[ ! -f "$UPLOADS_ARCHIVE" ]]; then
  echo "Uploads backup not found: $UPLOADS_ARCHIVE" >&2
  exit 1
fi

FULL_ARCHIVE="$FULL_BACKUP_DIR/full_${DATE_TAG}.tar.gz"
FULL_HASH_FILE="$FULL_BACKUP_DIR/full_${DATE_TAG}.sha256"

tar -czf "$FULL_ARCHIVE" -C "$DB_BACKUP_DIR" "$(basename "$DB_ARCHIVE")" -C "$UPLOADS_BACKUP_DIR" "$(basename "$UPLOADS_ARCHIVE")"
sha256sum "$FULL_ARCHIVE" > "$FULL_HASH_FILE"

# 可选：删除 30 天前的备份
find "$FULL_BACKUP_DIR" -type f -name "*.tar.gz" -mtime +30 -delete
find "$FULL_BACKUP_DIR" -type f -name "*.sha256" -mtime +30 -delete

echo "Full backup OK: $FULL_ARCHIVE"
