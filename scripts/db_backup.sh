#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/backend/data"
DB_PATH="${DB_PATH:-$DATA_DIR/guatswr_web_main.db}"
if [[ "$DB_PATH" != /* ]]; then
  DB_PATH="$DATA_DIR/$DB_PATH"
fi
LOG_DB_PATH="${LOG_DB_PATH:-$DATA_DIR/guatswr_web_logs.db}"
if [[ "$LOG_DB_PATH" != /* ]]; then
  LOG_DB_PATH="$DATA_DIR/$LOG_DB_PATH"
fi
BACKUP_DIR="$ROOT_DIR/backups/db"
DATE_TAG="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

TMP_DIR="$(mktemp -d "$BACKUP_DIR/tmp_${DATE_TAG}_XXXX")"
BACKUP_ARCHIVE="$BACKUP_DIR/db_${DATE_TAG}.tar.gz"
HASH_FILE="$BACKUP_DIR/db_${DATE_TAG}.sha256"

backup_one() {
  local src="$1"
  local name="$2"
  if [[ ! -f "$src" ]]; then
    echo "DB not found: $src" >&2
    return 1
  fi
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "$src" ".backup '$TMP_DIR/$name'"
  else
    cp "$src" "$TMP_DIR/$name"
  fi
  return 0
}

SUCCESS_COUNT=0
backup_one "$DB_PATH" "main.db" && SUCCESS_COUNT=$((SUCCESS_COUNT+1))
backup_one "$LOG_DB_PATH" "logs.db" && SUCCESS_COUNT=$((SUCCESS_COUNT+1))

if [[ "$SUCCESS_COUNT" -eq 0 ]]; then
  rm -rf "$TMP_DIR"
  exit 1
fi

tar -czf "$BACKUP_ARCHIVE" -C "$TMP_DIR" .
rm -rf "$TMP_DIR"

sha256sum "$BACKUP_ARCHIVE" > "$HASH_FILE"

# 可选：删除 30 天前的备份
find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +30 -delete
find "$BACKUP_DIR" -type f -name "*.sha256" -mtime +30 -delete

echo "DB backup OK: ${BACKUP_ARCHIVE}"
