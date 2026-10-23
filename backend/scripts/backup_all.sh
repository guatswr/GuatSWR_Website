#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_backup_common.sh"
require_tool python3
export DATA_DIR BACKUP_ROOT DB_PATH LOG_DB_PATH
export BACKUP_DATE_TAG="$DATE_TAG"
export PUBLIC_DIR="${PUBLIC_DIR:-$DATA_DIR/public}"
# Pause cleanup metadata moves and drain any move already holding SQLite's writer
# lock before taking the DB/public/quarantine snapshots. This does not fence uploads.
[[ -f "$DB_PATH" && -f "$LOG_DB_PATH" ]] || fail 'both main and audit databases must exist'
FENCE_DIR="$DATA_DIR/.asset-cleanup-fence"
mkdir -m 700 -- "$FENCE_DIR" || fail 'backup or cleanup fence already exists; inspect before retrying'
trap 'rmdir -- "$FENCE_DIR"' EXIT
"$SQLITE3_BIN" "$DB_PATH" 'PRAGMA busy_timeout=5000; BEGIN IMMEDIATE; COMMIT;' >/dev/null
/bin/bash "$SCRIPT_DIR/db_backup.sh"
/bin/bash "$SCRIPT_DIR/uploads_backup.sh"
CONSISTENCY='online-per-resource'
if [[ "${BACKUP_WRITE_FENCE:-}" == 'acknowledged' ]]; then CONSISTENCY='quiesced-attested'; fi
python3 "$SCRIPT_DIR/backup_bundle.py" full \
  --db "$BACKUP_ROOT/db/db_${DATE_TAG}.tar.gz" \
  --public "$BACKUP_ROOT/uploads/uploads_${DATE_TAG}.tar.gz" \
  --public-manifest "$BACKUP_ROOT/uploads/uploads_${DATE_TAG}.manifest.json" \
  --out "$BACKUP_ROOT/full" --tag "$DATE_TAG" --consistency "$CONSISTENCY" \
  --revision "${BACKUP_SOURCE_REVISION:-unknown}" --quarantine "$DATA_DIR/asset-quarantine"
