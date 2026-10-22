#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_backup_common.sh"
require_tool python3
PUBLIC_DIR="${PUBLIC_DIR:-$DATA_DIR/public}"
exec python3 "$SCRIPT_DIR/backup_bundle.py" public --root "$PUBLIC_DIR" --out "$BACKUP_ROOT/uploads" --tag "$DATE_TAG"
