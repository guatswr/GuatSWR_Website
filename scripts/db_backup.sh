#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/backend/data"
DB_PATH="$DATA_DIR/app.db"
BACKUP_DIR="$ROOT_DIR/backups/db"
DATE_TAG="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "DB not found: $DB_PATH" >&2
  exit 1
fi

BACKUP_FILE="$BACKUP_DIR/app_${DATE_TAG}.db"

if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"
else
  cp "$DB_PATH" "$BACKUP_FILE"
fi

gzip -f "$BACKUP_FILE"

# 可选：删除 30 天前的备份
find "$BACKUP_DIR" -type f -name "*.gz" -mtime +30 -delete

echo "DB backup OK: ${BACKUP_FILE}.gz"
