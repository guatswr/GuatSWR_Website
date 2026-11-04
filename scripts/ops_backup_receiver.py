#!/usr/bin/env python3
"""Run on Aliyun, dedicated backup account; strict namespace, atomic rsync uploads."""
import argparse
import json
from pathlib import Path
import re
import time


def plan(root, days=30, minimum=7, now=None):
    now = time.time() if now is None else now
    if days < 1 or minimum < 2:
        raise ValueError('unsafe retention')
    files = sorted((p for p in root.iterdir() if re.fullmatch(r'guatswr-\d{8}T\d{6}Z\.tar\.gpg', p.name) and p.is_file() and not p.is_symlink()), reverse=True)
    return [p for p in files[minimum:] if now - p.stat().st_mtime > days * 86400]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--minimum', type=int, default=7)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not args.root.is_absolute() or args.root.is_symlink():
        raise ValueError('absolute dedicated directory required')
    targets = plan(args.root, args.days, args.minimum)
    for target in targets:
        print(json.dumps({'delete' if args.apply else 'would_delete': target.name}))
        if args.apply:
            target.unlink()


if __name__ == '__main__':
    main()
