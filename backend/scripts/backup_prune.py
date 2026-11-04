#!/usr/bin/env python3
"""Local retention: dry-run default; keep a verified full recovery point."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import re
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--minimum', type=int, default=7)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.root.is_absolute() or args.root.is_symlink() or args.days < 1 or args.minimum < 2:
        raise ValueError('unsafe policy')
    spec = importlib.util.spec_from_file_location('bundle', Path(__file__).with_name('backup_bundle.py'))
    bundle = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(bundle)
    # Same lock as API deletion and restore verification; unknown locks fail closed.
    locks = []
    try:
        for kind in ['full', 'db', 'uploads']:
            directory = args.root / kind
            if directory.is_symlink():
                raise ValueError('symlink directory')
            lock = directory / '.backup-retention.lock'
            locks.append(bundle.directory_lock(lock))
        verified = []
        for marker in (args.root / 'full').glob('full_*.tar.gz.verified.json'):
            if marker.is_symlink():
                raise ValueError('symlink marker')
            value = json.loads(marker.read_text())
            archive = marker.with_name(marker.name.removesuffix('.verified.json'))
            if archive.is_symlink() or value.get('format') != 'guatswr-verified-backup' or value.get('source_identity') != bundle.verification_identity(archive) or value.get('source_sha256') != bundle.digest(archive):
                raise ValueError('invalid verification marker')
            verified.append(archive)
        if not verified:
            raise ValueError('no verified full recovery point; cleanup refused')
        protected = max(verified, key=lambda p: p.stat().st_mtime)
        for kind in ['full', 'db', 'uploads']:
            directory = args.root / kind
            files = sorted((p for p in directory.iterdir() if re.fullmatch(kind + r'_\d{8}_\d{6}(?:_[A-Za-z0-9_-]{1,64})?\.tar\.gz', p.name) and p.is_file() and not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
            for archive in files[args.minimum:]:
                if archive == protected or time.time() - archive.stat().st_mtime <= args.days * 86400:
                    continue
                print(json.dumps({'delete' if args.apply else 'would_delete': str(archive)}))
                if args.apply:
                    archive.unlink()
                    for sidecar in [archive.with_name(archive.name + '.verified.json'), archive.with_name(archive.name.removesuffix('.tar.gz') + '.sha256'), archive.with_name(archive.name.removesuffix('.tar.gz') + '.manifest.json')]:
                        if sidecar.is_symlink():
                            raise ValueError('symlink sidecar')
                        sidecar.unlink(missing_ok=True)
    finally:
        for lock in reversed(locks):
            lock()


if __name__ == '__main__':
    main()
