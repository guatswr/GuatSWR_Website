#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_backup_common.sh"
require_tool python3
export DATA_DIR BACKUP_ROOT DB_PATH LOG_DB_PATH
export BACKUP_DATE_TAG="$DATE_TAG"
export PUBLIC_DIR="${PUBLIC_DIR:-$DATA_DIR/public}"
/bin/bash "$SCRIPT_DIR/db_backup.sh"
/bin/bash "$SCRIPT_DIR/uploads_backup.sh"
CONSISTENCY='online-per-resource'
if [[ "${BACKUP_WRITE_FENCE:-}" == 'acknowledged' ]]; then CONSISTENCY='quiesced-attested'; fi
exec python3 "$SCRIPT_DIR/backup_bundle.py" full \
  --db "$BACKUP_ROOT/db/db_${DATE_TAG}.tar.gz" \
  --public "$BACKUP_ROOT/uploads/uploads_${DATE_TAG}.tar.gz" \
  --public-manifest "$BACKUP_ROOT/uploads/uploads_${DATE_TAG}.manifest.json" \
  --out "$BACKUP_ROOT/full" --tag "$DATE_TAG" --consistency "$CONSISTENCY" \
  --revision "${BACKUP_SOURCE_REVISION:-unknown}"
