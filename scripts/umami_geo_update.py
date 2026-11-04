#!/usr/bin/env python3
"""Update Umami's read-only directory mount; retain and validate a rollback DB."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tarfile
import tempfile
import time
import urllib.request

SOURCE = 'https://api.github.com/repos/GitSquared/node-geolite2-redist/contents/redist/GeoLite2-City.tar.gz?ref=master'
MAX_BYTES = 180 * 1024 * 1024


def metadata(filename, require_fresh=True):
    size = filename.stat().st_size
    if not 1024 < size <= MAX_BYTES:
        raise ValueError('invalid database size')
    with filename.open('rb') as stream:
        stream.seek(max(0, size - 131072))
        tail = stream.read()
    marker = b'\xab\xcd\xefMaxMind.com'
    pos = tail.rfind(marker)
    if pos < 0:
        raise ValueError('missing MMDB metadata')
    raw = tail[pos + len(marker):]

    def decode(offset, depth=0):
        if depth > 12:
            raise ValueError('metadata nesting limit')
        control = raw[offset]
        offset += 1
        kind, length = control >> 5, control & 31
        if kind == 0:
            kind = raw[offset] + 7
            offset += 1
        if length >= 29:
            count, base = {29: (1, 29), 30: (2, 285), 31: (3, 65821)}[length]
            length = base + int.from_bytes(raw[offset:offset + count], 'big')
            offset += count
        if length > 4096:
            raise ValueError('metadata size limit')
        if kind in (7, 11):
            result = {} if kind == 7 else []
            for _ in range(length):
                key, offset = decode(offset, depth + 1)
                if kind == 7:
                    value, offset = decode(offset, depth + 1)
                    result[key] = value
                else:
                    result.append(key)
            return result, offset
        if kind == 14:
            return bool(length), offset
        value = raw[offset:offset + length]
        if len(value) != length:
            raise ValueError('truncated metadata')
        if kind == 2:
            value = value.decode('utf-8')
        elif kind in (5, 6, 8, 9, 10):
            value = int.from_bytes(value, 'big', signed=kind == 8)
        elif kind == 3:
            value = struct.unpack('>d', value)[0]
        else:
            raise ValueError('unsupported metadata type')
        return value, offset + length

    value, _ = decode(0)
    if value.get('database_type') != 'GeoLite2-City' or value.get('ip_version') != 6:
        raise ValueError('expected IPv4/IPv6 GeoLite2 City database')
    if value.get('record_size') not in (24, 28, 32) or not 0 < value.get('node_count', 0) * value['record_size'] // 4 < size:
        raise ValueError('invalid search tree')
    epoch = value.get('build_epoch', 0)
    if epoch > time.time() + 86400 or epoch <= 0 or (require_fresh and epoch < time.time() - 45 * 86400):
        raise ValueError('database build date outside accepted window')
    return value


def download_candidate(directory, source):
    archive = directory / 'download.tar.gz'
    headers = {'Accept': 'application/vnd.github.raw', 'User-Agent': 'GuatSWR-Geo-Updater'}
    with urllib.request.urlopen(urllib.request.Request(source, headers=headers, method='HEAD'), timeout=15) as response:
        length = int(response.headers.get('Content-Length', '0'))
        etag = response.headers.get('ETag', '')
    if length > MAX_BYTES:
        raise ValueError('download budget exceeded')

    def fetch(output, budget, span=None):
        command = ['curl', '--fail', '--location', '--silent', '--show-error',
                   '--connect-timeout', '15', '--max-time', '180',
                   '--retry', '1', '--retry-max-time', '210',
                   '--max-filesize', str(budget), '-H', 'Accept: application/vnd.github.raw']
        if span:
            command += ['--range', span]
            if etag and not etag.startswith('W/'):
                command += ['-H', 'If-Range: ' + etag]
        subprocess.run([*command, '--output', str(output), source], check=True, timeout=390)

    if length > 2 * 1024 * 1024:
        # GitHub limits each connection on this host. Six bounded range reads
        # avoid one slow transfer exhausting the whole job's deadline.
        step = (length + 5) // 6
        parts = []
        with ThreadPoolExecutor(max_workers=6) as pool:
            futures = []
            for index, start in enumerate(range(0, length, step)):
                end = min(length - 1, start + step - 1)
                part = directory / f'part-{index}'
                parts.append((part, end - start + 1))
                futures.append(pool.submit(fetch, part, end - start + 1, f'{start}-{end}'))
            for future in futures:
                future.result()
        with archive.open('wb') as output:
            for part, expected in parts:
                if part.stat().st_size != expected:
                    raise ValueError('incomplete range response')
                with part.open('rb') as stream:
                    shutil.copyfileobj(stream, output)
    else:
        fetch(archive, MAX_BYTES)
    if archive.stat().st_size > MAX_BYTES:
        raise ValueError('download budget exceeded')
    candidate = directory / 'candidate.mmdb'
    found = False
    with tarfile.open(archive, 'r:gz') as bundle:
        for index, entry in enumerate(bundle):
            if index >= 10000:
                raise ValueError('archive entry budget exceeded')
            if Path(entry.name).name != 'GeoLite2-City.mmdb':
                continue
            if found or not entry.isfile() or entry.size > MAX_BYTES:
                raise ValueError('invalid database archive entry')
            with bundle.extractfile(entry) as source_file, candidate.open('wb') as output:
                shutil.copyfileobj(source_file, output)
            found = True
    if not found:
        raise ValueError('database absent from archive')
    return candidate


def update(directory, source=SOURCE, activate=False, container="umami"):
    if not directory.is_absolute() or directory == Path('/') or directory.is_symlink():
        raise ValueError('explicit private absolute directory required')
    directory.mkdir(parents=True, exist_ok=True)
    # Kernel releases this lock after a crash; there is no stale mkdir fence.
    import fcntl
    with (directory / '.update.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for stale in directory.glob('.geo-update-*'):
            if stale.is_dir() and not stale.is_symlink():
                shutil.rmtree(stale)
        current = directory / 'GeoLite2-City.mmdb'
        previous = directory / 'GeoLite2-City.previous.mmdb'
        with tempfile.TemporaryDirectory(prefix='.geo-update-', dir=directory) as temp:
            candidate = download_candidate(Path(temp), source)
            info = metadata(candidate)
            digest = hashlib.file_digest(candidate.open('rb'), 'sha256').hexdigest()
            if current.exists():
                old = metadata(current, require_fresh=False)
                if info['build_epoch'] < old['build_epoch']:
                    raise ValueError('refusing database downgrade')
                if hashlib.file_digest(current.open('rb'), 'sha256').hexdigest() == digest:
                    receipt = {'status': 'unchanged', 'checked_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                               'source': source, 'sha256': digest, 'build_epoch': info['build_epoch'],
                               'database_type': info['database_type']}
                    (directory / 'update.json').write_text(json.dumps(receipt, indent=2) + '\n')
                    print(json.dumps(receipt))
                    return
                shutil.copy2(current, previous)
            candidate.chmod(0o644)
            with candidate.open('rb') as stream:
                os.fsync(stream.fileno())
            os.replace(candidate, current)
            try:
                if activate:
                    subprocess.run(['docker', 'restart', '--time', '30', container], check=True, timeout=60, stdout=subprocess.DEVNULL)
                    for _ in range(30):
                        try:
                            with urllib.request.urlopen('http://127.0.0.1:13036/script.js', timeout=2) as response:
                                if response.status == 200:
                                    break
                        except (OSError, TimeoutError):
                            time.sleep(1)
                    else:
                        raise RuntimeError('Umami did not recover after geo reload')
            except BaseException:
                if previous.exists():
                    rollback = Path(temp) / 'rollback.mmdb'
                    shutil.copy2(previous, rollback)
                    os.replace(rollback, current)
                    subprocess.run(['docker', 'restart', '--time', '30', container], timeout=60, stdout=subprocess.DEVNULL, check=False)
                raise
            receipt = {'updated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'source': source,
                       'sha256': digest, 'build_epoch': info['build_epoch'], 'database_type': info['database_type']}
            (directory / 'update.json').write_text(json.dumps(receipt, indent=2) + '\n')
            print(json.dumps({'status': 'updated', **receipt}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, required=True)
    parser.add_argument('--activate', action='store_true')
    parser.add_argument('--container', default='umami', help='Name of the Docker container running Umami (default: umami)')
    args = parser.parse_args()
    update(args.directory, activate=args.activate, container=args.container)
