#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <db_backup.tar.gz|db_backup.db> <uploads_backup.tar.gz>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="$ROOT_DIR/backend/data"
PUBLIC_DIR="$ROOT_DIR/backend/data/public"
MAIN_DB_PATH="$DATA_DIR/guatswr_web_main.db"
LOG_DB_PATH="$DATA_DIR/guatswr_web_logs.db"

DB_BACKUP="$1"
UPLOADS_BACKUP="$2"

mkdir -p "$DATA_DIR" "$PUBLIC_DIR"

# 恢复 DB（tar.gz 内包含 main.db 与 logs）
if [[ "$DB_BACKUP" == *.tar.gz ]]; then
  TMP_DIR="$(mktemp -d "$DATA_DIR/restore_db_XXXX")"
  tar -xzf "$DB_BACKUP" -C "$TMP_DIR"
  if [[ -f "$TMP_DIR/main.db" ]]; then
    cp "$TMP_DIR/main.db" "$MAIN_DB_PATH"
  else
    echo "main.db not found in backup: $DB_BACKUP" >&2
    rm -rf "$TMP_DIR"
    exit 1
  fi
  if [[ -f "$TMP_DIR/logs" ]]; then
    cp "$TMP_DIR/logs" "$LOG_DB_PATH"
  elif [[ -f "$TMP_DIR/logs.db" ]]; then
    cp "$TMP_DIR/logs.db" "$LOG_DB_PATH"
  else
    echo "logs not found in backup: $DB_BACKUP" >&2
    rm -rf "$TMP_DIR"
    exit 1
  fi
  rm -rf "$TMP_DIR"
elif [[ "$DB_BACKUP" == *.gz ]]; then
  gunzip -c "$DB_BACKUP" > "$MAIN_DB_PATH"
else
  cp "$DB_BACKUP" "$MAIN_DB_PATH"
fi

# 清理 WAL/SHM（建议在服务停止时执行）
rm -f "$MAIN_DB_PATH"-wal "$MAIN_DB_PATH"-shm "$LOG_DB_PATH"-wal "$LOG_DB_PATH"-shm

# 恢复上传与资源文件（public 目录）
rm -rf "$PUBLIC_DIR"/*
tar -xzf "$UPLOADS_BACKUP" -C "$PUBLIC_DIR"

echo "Restore OK"
