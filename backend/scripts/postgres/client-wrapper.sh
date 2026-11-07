#!/bin/sh
set -eu
tool=$(basename "$0")
case "$tool" in pg_dump|pg_restore) ;; *) exit 64 ;; esac
for loader in /opt/postgres/lib/ld-linux*.so.*; do
  if [ -f "$loader" ]; then
    exec "$loader" --library-path /opt/postgres/lib "/opt/postgres/bin/$tool" "$@"
  fi
done
exit 69
