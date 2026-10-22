#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
export DATA_DIR="${DATA_DIR:-$ROOT_DIR/backend/data}"
export BACKUP_ROOT="${BACKUP_ROOT:-$ROOT_DIR/backups}"
exec /bin/bash "$ROOT_DIR/backend/scripts/backup_all.sh" "$@"
