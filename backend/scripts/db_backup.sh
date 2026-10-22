#!/usr/bin/env bash
set -euo pipefail
source "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/_backup_common.sh"
[[ -f "$DB_PATH" && -f "$LOG_DB_PATH" ]] || fail 'both main and audit database files are required'
if [[ "$DB_PATH" -ef "$LOG_DB_PATH" ]]; then fail 'databases must be distinct'; fi
BACKUP_DIR="$BACKUP_ROOT/db"
mkdir -p -- "$BACKUP_DIR"
BACKUP_ARCHIVE="$BACKUP_DIR/db_${DATE_TAG}.tar.gz"
HASH_FILE="$BACKUP_DIR/db_${DATE_TAG}.sha256"
LOCK_DIR="$BACKUP_DIR/.db_${DATE_TAG}.lock"
[[ ! -e "$BACKUP_ARCHIVE" && ! -e "$HASH_FILE" ]] || fail 'refusing to overwrite an existing backup'
mkdir -- "$LOCK_DIR" || fail 'backup tag is already in use'
TMP_DIR=""
PUBLISHED=0
cleanup() {
  local status=$?
  if [[ "$status" -ne 0 && "$PUBLISHED" -eq 1 ]]; then rm -f -- "$BACKUP_ARCHIVE" "$HASH_FILE"; fi
  if [[ -n "$TMP_DIR" && "$TMP_DIR" == "$BACKUP_DIR"/.db_* ]]; then rm -rf -- "$TMP_DIR"; fi
  rmdir -- "$LOCK_DIR"
  exit "$status"
}
trap cleanup EXIT
TMP_DIR="$(mktemp -d "$BACKUP_DIR/.db_${DATE_TAG}_XXXXXX")"
backup_one() {
  local source_db="$1" name="$2"
  "$SQLITE3_BIN" -readonly "$source_db" '.timeout 5000' ".backup '$TMP_DIR/$name'"
  [[ "$("$SQLITE3_BIN" -readonly "$TMP_DIR/$name" 'PRAGMA integrity_check;')" == 'ok' ]] || fail 'snapshot integrity_check failed'
  [[ -z "$("$SQLITE3_BIN" -readonly "$TMP_DIR/$name" 'PRAGMA foreign_key_check;')" ]] || fail 'snapshot foreign_key_check failed'
}
backup_one "$DB_PATH" main.db
backup_one "$LOG_DB_PATH" logs.db
tar -czf "$TMP_DIR/archive.tar.gz" -C "$TMP_DIR" main.db logs.db
DIGEST="$(sha256sum "$TMP_DIR/archive.tar.gz")"
printf '%s  %s\n' "${DIGEST%% *}" "db_${DATE_TAG}.tar.gz" > "$TMP_DIR/archive.sha256"
ln -- "$TMP_DIR/archive.tar.gz" "$BACKUP_ARCHIVE"
PUBLISHED=1
ln -- "$TMP_DIR/archive.sha256" "$HASH_FILE"
echo "DB backup OK: $BACKUP_ARCHIVE"
