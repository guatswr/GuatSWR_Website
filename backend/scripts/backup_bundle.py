"""Verified backup bundles and restore-to-new-directory. Never imports the application."""
import argparse
import contextlib
import datetime
import gzip
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sqlite3
import stat
import tarfile
import tempfile

MAX_BYTES = 20 * 1024**3
MAX_FILES = 100_000
MAX_METADATA = 32 * 1024**2
MANIFEST = '.guatswr-backup.json'


def digest(filename):
    h = hashlib.sha256()
    with open(filename, 'rb') as source:
        for chunk in iter(lambda: source.read(1024**2), b''):
            h.update(chunk)
    return h.hexdigest()


def info(filename):
    return {'size': Path(filename).stat().st_size, 'sha256': digest(filename)}


def json_bytes(value):
    data = (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + '\n').encode()
    if len(data) > MAX_METADATA:
        raise ValueError('manifest size exceeds limit')
    return data


def utcnow():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def clean_name(raw):
    while raw.startswith('./'):
        raw = raw[2:]
    if raw in ('', '.'):
        return ''
    if len(raw) > 4096 or raw.startswith('/') or '\\' in raw or ':' in raw or '\0' in raw:
        raise ValueError('unsafe archive path')
    if any(part in ('', '.', '..') for part in raw.rstrip('/').split('/')):
        raise ValueError('unsafe archive path component')
    return str(PurePosixPath(raw))


class SafeInfo(tarfile.TarInfo):
    def _proc_pax(self, archive):
        if not 0 <= self.size <= 1024**2:
            raise ValueError('oversized PAX metadata')
        return super()._proc_pax(archive)

    def _proc_gnulong(self, archive):
        if not 0 <= self.size <= 64 * 1024:
            raise ValueError('oversized GNU metadata')
        return super()._proc_gnulong(archive)

    def _proc_sparse(self, archive):
        raise ValueError('sparse archives are not supported')


class LimitedReader:
    def __init__(self, stream):
        self.stream = stream
        self.total = 0

    def read(self, size=-1):
        if size < 0:
            size = MAX_BYTES + 1 - self.total
        result = self.stream.read(min(size, MAX_BYTES + 1 - self.total))
        self.total += len(result)
        if self.total > MAX_BYTES:
            raise ValueError('decompressed archive exceeds size limit')
        return result


@contextlib.contextmanager
def open_tar(filename):
    if Path(filename).stat().st_size > MAX_BYTES:
        raise ValueError('archive exceeds size limit')
    with gzip.open(filename, 'rb') as stream:
        with tarfile.open(fileobj=LimitedReader(stream), mode='r|', tarinfo=SafeInfo) as archive:
            yield archive


def members(archive):
    seen = set()
    total = 0
    for entry in archive:
        name = clean_name(entry.name)
        if name in seen:
            raise ValueError('duplicate archive entry')
        seen.add(name)
        if len(seen) > MAX_FILES:
            raise ValueError('too many archive entries')
        if entry.type not in (tarfile.REGTYPE, tarfile.AREGTYPE, tarfile.DIRTYPE):
            raise ValueError('links and special archive entries are forbidden')
        if entry.size < 0 or any(key.startswith('GNU.sparse') for key in entry.pax_headers):
            raise ValueError('invalid or sparse archive size')
        total += entry.size
        if total > MAX_BYTES:
            raise ValueError('archive members exceed size limit')
        if not name and not entry.isdir():
            raise ValueError('invalid archive root')
        yield name, entry


def scan(filename):
    result = {}
    dirs = set()
    with open_tar(filename) as archive:
        for name, entry in members(archive):
            if entry.isdir():
                dirs.add(name)
                continue
            h = hashlib.sha256()
            with archive.extractfile(entry) as source:
                for chunk in iter(lambda: source.read(1024**2), b''):
                    h.update(chunk)
            result[name] = {'size': entry.size, 'sha256': h.hexdigest()}
    for name in list(result) + list(dirs):
        for parent in PurePosixPath(name).parents:
            if str(parent) in result:
                raise ValueError('file used as archive parent directory')
    return result


def extract_checked(filename, output, expected):
    if scan(filename) != expected:
        raise ValueError('archive contents do not match manifest')
    output.mkdir(parents=True, exist_ok=True)
    with open_tar(filename) as archive:
        for name, entry in members(archive):
            if not name:
                continue
            target = output.joinpath(*PurePosixPath(name).parts)
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            with archive.extractfile(entry) as source, open(target, 'xb') as dest:
                shutil.copyfileobj(source, dest, 1024**2)
            os.chmod(target, 0o600)
            if info(target) != expected[name]:
                raise ValueError('extracted file checksum mismatch')


def verify_outer(filename, supplied=None):
    expected = supplied
    if expected is None:
        sidecar = Path(str(filename).removesuffix('.tar.gz') + '.sha256')
        if not sidecar.is_file() or sidecar.stat().st_size > 4096:
            raise ValueError('trusted archive checksum or sidecar is required')
        expected = sidecar.read_text().split()[0]
    if not re.fullmatch('[0-9a-fA-F]{64}', expected or '') or digest(filename) != expected.lower():
        raise ValueError('archive checksum mismatch')


def publish(source, dest):
    # Atomic no-replace publication on the same filesystem.
    os.link(source, dest)


def finish_archive(staged, output, base, extra=None):
    archive = output / (base + '.tar.gz')
    sha = output / (base + '.sha256')
    meta = output / (base + '.manifest.json')
    if any(path.exists() for path in [archive, sha] + ([meta] if extra else [])):
        raise ValueError('refusing to overwrite an existing backup')
    checksum = staged.parent / 'checksum'
    checksum.write_text(digest(staged) + '  ' + archive.name + '\n')
    os.chmod(staged, 0o600)
    os.chmod(checksum, 0o600)
    metadata = staged.parent / 'metadata'
    if extra:
        metadata.write_bytes(json_bytes(extra))
        os.chmod(metadata, 0o600)
    made = []
    try:
        for source, target in [(staged, archive), (checksum, sha)] + ([(metadata, meta)] if extra else []):
            publish(source, target)
            made.append(target)
    except BaseException:
        for target in made:
            target.unlink(missing_ok=True)
        raise
    return archive


def validate_tag(tag):
    if not re.fullmatch(r'\d{8}_\d{6}(?:_[A-Za-z0-9_-]{1,64})?', tag):
        raise ValueError('invalid backup date tag')


def pack_public(root, output, tag):
    validate_tag(tag)
    root = root.resolve(strict=True)
    output = output.absolute()
    if not root.is_dir() or output.is_relative_to(root):
        raise ValueError('invalid public or output directory')
    output.mkdir(parents=True, exist_ok=True)
    files = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            item = Path(directory) / name
            mode = item.lstat().st_mode
            if not (stat.S_ISDIR(mode) or stat.S_ISREG(mode)):
                raise ValueError('source links or special files are forbidden')
            clean_name(item.relative_to(root).as_posix())
            files.append(item)
            if len(files) > MAX_FILES:
                raise ValueError('too many public files')
    with tempfile.TemporaryDirectory(prefix='.public_', dir=output) as work:
        staged = Path(work) / 'public.tar.gz'
        with tarfile.open(staged, 'w:gz', dereference=False) as archive:
            for item in sorted(files):
                archive.add(item, arcname=item.relative_to(root).as_posix(), recursive=False)
        file_hashes = scan(staged)
        metadata = {'format': 'guatswr-public', 'version': 2, 'created_at': utcnow(), 'files': file_hashes}
        return finish_archive(staged, output, 'uploads_' + tag, metadata)


def database_names(files):
    names = set(files)
    audit = 'logs.db' if 'logs.db' in names else 'logs'
    if names != {'main.db', audit}:
        raise ValueError('both and only main/audit databases are required')
    return audit


def pack_full(db, public, public_manifest, output, tag, consistency, revision):
    validate_tag(tag)
    verify_outer(db)
    verify_outer(public)
    db_files = scan(db)
    database_names(db_files)
    if public_manifest.stat().st_size > MAX_METADATA:
        raise ValueError('public manifest exceeds size limit')
    declared = json.loads(public_manifest.read_bytes())
    public_files = scan(public)
    if declared.get('files') != public_files:
        raise ValueError('public metadata does not match its archive')
    manifest = {'format': 'guatswr-full', 'version': 2, 'created_at': utcnow(),
                'timezone': 'Asia/Shanghai', 'consistency': consistency, 'source_revision': revision,
                'databases': {'archive': db.name, **info(db), 'files': db_files},
                'public': {'archive': public.name, **info(public), 'files': public_files}}
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.full_', dir=output) as work:
        work = Path(work)
        (work / MANIFEST).write_bytes(json_bytes(manifest))
        staged = work / 'full.tar.gz'
        with tarfile.open(staged, 'w:gz') as archive:
            archive.add(db, arcname=db.name)
            archive.add(public, arcname=public.name)
            archive.add(work / MANIFEST, arcname=MANIFEST)
        return finish_archive(staged, output, 'full_' + tag)


def validate_sqlite(filename, kind):
    from urllib.parse import quote
    uri = 'file:' + quote(filename.as_posix(), safe='/') + '?mode=ro&immutable=1'
    with contextlib.closing(sqlite3.connect(uri, uri=True)) as connection:
        connection.execute('PRAGMA trusted_schema=OFF')
        if connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
            raise ValueError('database integrity_check failed')
        if connection.execute('PRAGMA foreign_key_check').fetchone() is not None:
            raise ValueError('database foreign_key_check failed')
        tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        required = {'users', 'site_config'} if kind == 'main' else {'audit_logs'}
        if not required.issubset(tables):
            raise ValueError('database identity or baseline tables do not match')


def restore(archive_file, target, checksum, allow_legacy):
    archive_file = archive_file.resolve(strict=True)
    target = target.absolute()
    if target.exists() or target.is_symlink():
        raise ValueError('restore target must not exist')
    if not target.parent.is_dir():
        raise ValueError('restore parent must already exist')
    verify_outer(archive_file, checksum)
    outer = scan(archive_file)
    with tempfile.TemporaryDirectory(prefix='.guatswr-restore-', dir=target.parent) as work:
        work = Path(work)
        parts = work / 'parts'
        extract_checked(archive_file, parts, outer)
        manifest_file = parts / MANIFEST
        if manifest_file.exists():
            if manifest_file.stat().st_size > MAX_METADATA:
                raise ValueError('manifest too large')
            manifest = json.loads(manifest_file.read_bytes())
            if manifest.get('format') != 'guatswr-full' or manifest.get('version') != 2:
                raise ValueError('unsupported manifest')
            db_spec, public_spec = manifest['databases'], manifest['public']
            if set(outer) != {MANIFEST, db_spec['archive'], public_spec['archive']}:
                raise ValueError('unexpected full bundle entries')
        else:
            if not allow_legacy:
                raise ValueError('legacy bundle requires --allow-legacy and a trusted checksum')
            db_names = [name for name in outer if re.fullmatch(r'db_[\w-]+\.tar\.gz', name)]
            public_names = [name for name in outer if re.fullmatch(r'uploads_[\w-]+\.tar\.gz', name)]
            if len(db_names) != 1 or len(public_names) != 1 or len(outer) != 2:
                raise ValueError('invalid legacy full bundle')
            db_spec = {'archive': db_names[0], **info(parts / db_names[0]), 'files': scan(parts / db_names[0])}
            public_spec = {'archive': public_names[0], **info(parts / public_names[0]), 'files': scan(parts / public_names[0])}
            manifest = {'format': 'guatswr-full', 'version': 1, 'consistency': 'legacy-unknown', 'databases': db_spec, 'public': public_spec}
        for spec in [db_spec, public_spec]:
            name = clean_name(spec['archive'])
            if '/' in name or not name or name not in outer:
                raise ValueError('invalid nested archive name')
            if info(parts / name) != {'size': spec['size'], 'sha256': spec['sha256']}:
                raise ValueError('nested archive checksum mismatch')
        audit_name = database_names(db_spec['files'])
        candidate = work / 'candidate'
        databases = work / 'databases'
        extract_checked(parts / db_spec['archive'], databases, db_spec['files'])
        validate_sqlite(databases / 'main.db', 'main')
        validate_sqlite(databases / audit_name, 'audit')
        public = candidate / 'data/public'
        extract_checked(parts / public_spec['archive'], public, public_spec['files'])
        shutil.move(databases / 'main.db', candidate / 'data/guatswr_web_main.db')
        shutil.move(databases / audit_name, candidate / 'data/guatswr_web_logs.db')
        receipt = {'restored_at': utcnow(), 'source_sha256': digest(archive_file), 'manifest': manifest}
        (candidate / 'RESTORE_READY.json').write_bytes(json_bytes(receipt))
        # The parent is operator-controlled; cooperating restorers never overwrite.
        lock = target.parent / ('.' + target.name + '.restore-lock')
        lock.mkdir(mode=0o700)
        try:
            if target.exists() or target.is_symlink():
                raise ValueError('restore target appeared during validation')
            os.rename(candidate, target)
        finally:
            lock.rmdir()
    return target


def main():
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    public = commands.add_parser('public')
    public.add_argument('--root', type=Path, required=True)
    public.add_argument('--out', type=Path, required=True)
    public.add_argument('--tag', required=True)
    full = commands.add_parser('full')
    for name in ['db', 'public', 'public-manifest', 'out']:
        full.add_argument('--' + name, type=Path, required=True)
    full.add_argument('--tag', required=True)
    full.add_argument('--consistency', choices=['online-per-resource', 'quiesced-attested'], default='online-per-resource')
    full.add_argument('--revision', default='unknown')
    recover = commands.add_parser('restore')
    recover.add_argument('archive', type=Path)
    recover.add_argument('--target', type=Path, required=True)
    recover.add_argument('--sha256')
    recover.add_argument('--allow-legacy', action='store_true')
    args = parser.parse_args()
    if args.command == 'public':
        result = pack_public(args.root, args.out, args.tag)
    elif args.command == 'full':
        result = pack_full(args.db, args.public, args.public_manifest, args.out, args.tag, args.consistency, args.revision)
    else:
        result = restore(args.archive, args.target, args.sha256, args.allow_legacy)
    print(json.dumps({'ok': True, 'output': str(result)}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        raise SystemExit('Backup/restore refused: ' + str(error))
