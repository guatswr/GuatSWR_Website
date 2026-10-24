"""Synthetic archive/verification producer for Node/Python interoperability tests."""
import contextlib
import importlib.util
from pathlib import Path
import sqlite3
import sys
import tarfile

root, library, output = map(Path, sys.argv[1:])
spec = importlib.util.spec_from_file_location('bundle', library)
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)
work = root / 'verification-interop'
work.mkdir()
private = work / 'private'
private.mkdir()
job_id = '01234567-1234-1234-1234-0123456789ab'
(private / job_id).write_bytes(b'synthetic private interop')
for name in ['main.db', 'logs.db']:
    with contextlib.closing(sqlite3.connect(work / name)) as db:
        for table in (['users', 'site_config'] if name == 'main.db' else ['audit_logs']):
            db.execute('CREATE TABLE ' + table + '(id INTEGER PRIMARY KEY)')
        if name == 'main.db':
            db.execute('CREATE TABLE asset_cleanup_jobs (id TEXT PRIMARY KEY, identity TEXT, state TEXT)')
            db.execute('INSERT INTO asset_cleanup_jobs VALUES (?,?,?)', (job_id, bundle.verification_identity(private / job_id), 'pending'))
        db.commit()
archive = work / 'db_20300101_000000_verify.tar.gz'
with tarfile.open(archive, 'w:gz') as tar:
    for name in ['main.db', 'logs.db']:
        tar.add(work / name, arcname=name)
archive.with_name('db_20300101_000000_verify.sha256').write_text(bundle.digest(archive))
public = work / 'public'
public.mkdir()
(public / 'fixture.txt').write_text('synthetic interop')
packed = bundle.pack_public(public, work / 'parts', '20300101_000000_verify')
full = bundle.pack_full(archive, packed, packed.with_name('uploads_20300101_000000_verify.manifest.json'), output, '20300101_000000_verify', 'online-per-resource', 'synthetic', private)
bundle.verify_backup(full, work)
bundle.restore(full, work / 'restored', None, False)
