#!/usr/bin/env python3
"""Host backup job. Offsite encrypted copies, no local source deletion."""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import subprocess
import tempfile


def run(*args, **kwargs):
    return subprocess.run(args, check=True, timeout=1200, **kwargs)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    root = Path(config['work_dir'])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    with open(root / '.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if not args.apply:
            print(json.dumps({'dry_run': True, 'destination': config['destination'], 'retention_days': 30}))
            return
        with tempfile.TemporaryDirectory(prefix='backup-', dir=root) as directory:
            work = Path(directory)
            tag = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
            # Force one scheduler owner: host timer owns backups; application timer
            # must be disabled before installation (see OPERATIONS).
            run('docker', 'exec', 'guatswr-backend-1', 'timeout', '--kill-after=5s', '240s', '/bin/bash', '/app/scripts/backup_all.sh')
            info = json.loads(subprocess.check_output(['docker', 'inspect', 'guatswr-backend-1']))[0]
            source = Path(next(m['Source'] for m in info['Mounts'] if m['Destination'] == '/app/backups'))
            archive = max((source / 'full').glob('full_*.tar.gz'), key=lambda p: p.stat().st_mtime)
            # Full restore validation must succeed before encryption/upload.
            run('docker', 'exec', 'guatswr-backend-1', 'timeout', '--kill-after=5s', '300s', 'python3', '/app/scripts/backup_bundle.py', 'verify', '/app/backups/full/' + archive.name, '--work-dir', '/tmp')
            run('cp', '--', str(archive), str(work / 'website.tar.gz'))
            with open(work / 'umami.sql', 'wb') as output:
                run('docker', 'exec', 'umami-db', 'timeout', '180s', 'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges', stdout=output)
            encrypted = root / ('guatswr-' + tag + '.tar.gpg')
            try:
                # Streaming pipeline avoids leaving an extra plaintext tar.
                tar = subprocess.Popen(['tar', '-C', str(work), '-cf', '-', '.'], stdout=subprocess.PIPE)
                try:
                    run('gpg', '--batch', '--trust-model', 'always', '--recipient', config['gpg_recipient'], '--encrypt', '--output', str(encrypted), stdin=tar.stdout)
                    tar.stdout.close()
                    if tar.wait(timeout=60):
                        raise RuntimeError('archive failed')
                finally:
                    if tar.poll() is None:
                        tar.kill()
                        tar.wait()
                # SSH alias has pinned host key and dedicated account/key.
                run('rsync', '--chmod=F600', '--', str(encrypted), config['destination'])
                # Receiver performs retention only after successful upload.
                run('ssh', '-oBatchMode=yes', config['ssh_alias'], 'python3 /opt/guatswr-backup/ops_backup_receiver.py --root /srv/guatswr-backups --days 30 --minimum 7 --apply')
                run('docker', 'exec', 'guatswr-backend-1', 'python3', '/app/scripts/backup_prune.py', '--root', '/app/backups', '--days', '30', '--minimum', '7', '--apply')
                state = root / 'last-success.json'
                temporary = root / '.success.tmp'
                temporary.write_text(json.dumps({'at': dt.datetime.now(dt.timezone.utc).isoformat(), 'artifact': encrypted.name}))
                os.replace(temporary, state)
            finally:
                encrypted.unlink(missing_ok=True)


if __name__ == '__main__':
    os.umask(0o077)
    main()
