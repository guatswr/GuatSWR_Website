#!/usr/bin/env bash
set -euo pipefail
umask 077
fail() { echo "Backup error: $*" >&2; exit 1; }
require_tool() { command -v "$1" >/dev/null 2>&1 || fail "required tool unavailable: $1"; }
SQLITE3_BIN="${SQLITE3_BIN:-sqlite3}"
require_tool "$SQLITE3_BIN"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
DATA_DIR="${DATA_DIR:-$ROOT_DIR/data}"
BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
PUBLIC_DIR="${PUBLIC_DIR:-$DATA_DIR/public}"
for value in "$DATA_DIR" "$BACKUP_ROOT" "$PUBLIC_DIR"; do
  [[ "$value" == /* ]] || fail 'data and backup roots must be absolute'
  [[ "$value" != *"'"* && "$value" != *'"'* && "$value" != *$'\n'* && "$value" != *$'\r'* && "$value" != *'\'* ]] || fail 'unsupported control or quote in path'
done
require_tool python3
python3 - "$BACKUP_ROOT" "$PUBLIC_DIR" <<'PY'
import sys
from pathlib import Path
if Path(sys.argv[1]).resolve().is_relative_to(Path(sys.argv[2]).resolve()):
    raise SystemExit('Backup error: backup root must be outside the public directory')
PY
DB_PATH="${DB_PATH:-guatswr_web_main.db}"
LOG_DB_PATH="${LOG_DB_PATH:-guatswr_web_logs.db}"
[[ "$DB_PATH" == /* ]] || DB_PATH="$DATA_DIR/$DB_PATH"
[[ "$LOG_DB_PATH" == /* ]] || LOG_DB_PATH="$DATA_DIR/$LOG_DB_PATH"
[[ "$DB_PATH" != "$LOG_DB_PATH" ]] || fail 'databases must be distinct'
DATE_TAG="${BACKUP_DATE_TAG:-$(TZ=Asia/Shanghai date +%Y%m%d_%H%M%S)_${RANDOM}}"
[[ "$DATE_TAG" =~ ^[0-9]{8}_[0-9]{6}(_[A-Za-z0-9_-]{1,64})?$ ]] || fail 'invalid backup date tag'
