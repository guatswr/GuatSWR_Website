#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPLOAD_DIR="$ROOT_DIR/backend/data/public/upload"
BACKUP_DIR="$ROOT_DIR/backups/uploads"
DATE_TAG="$(date +%Y%m%d_%H%M%S)"

mkdir -p "$BACKUP_DIR"

if [[ ! -d "$UPLOAD_DIR" ]]; then
  echo "Upload dir not found: $UPLOAD_DIR" >&2
  exit 1
fi

ARCHIVE="$BACKUP_DIR/uploads_${DATE_TAG}.tar.gz"

# 生成文件哈希清单，便于防篡改校验
HASH_FILE="$BACKUP_DIR/uploads_${DATE_TAG}.sha256"

(cd "$UPLOAD_DIR" && find . -type f -print0 | sort -z | xargs -0 sha256sum) > "$HASH_FILE"

tar -czf "$ARCHIVE" -C "$UPLOAD_DIR" .

# 可选：删除 30 天前的备份
find "$BACKUP_DIR" -type f -name "*.tar.gz" -mtime +30 -delete
find "$BACKUP_DIR" -type f -name "*.sha256" -mtime +30 -delete

echo "Uploads backup OK: $ARCHIVE"
