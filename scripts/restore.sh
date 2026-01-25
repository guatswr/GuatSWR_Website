#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <db_backup.gz> <uploads_backup.tar.gz>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/backend/data"
UPLOAD_DIR="$ROOT_DIR/backend/data/public/upload"
DB_PATH="$DATA_DIR/app.db"

DB_BACKUP="$1"
UPLOADS_BACKUP="$2"

mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

# 恢复 DB
if [[ "$DB_BACKUP" == *.gz ]]; then
  gunzip -c "$DB_BACKUP" > "$DB_PATH"
else
  cp "$DB_BACKUP" "$DB_PATH"
fi

# 恢复上传文件
rm -rf "$UPLOAD_DIR"/*
tar -xzf "$UPLOADS_BACKUP" -C "$UPLOAD_DIR"

echo "Restore OK"
