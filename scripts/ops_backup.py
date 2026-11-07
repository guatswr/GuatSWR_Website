#!/usr/bin/env python3
"""Host backup job with identity verification and single-instance scheduling (OPS-01).

Guarantees:
- Resolves container exclusively by compose label; rejects zero or multiple instances.
- Generates a unique, host-verified date tag passed via BACKUP_DATE_TAG.
- Never selects stale/future-mtime archives: strictly binds to full_<tag>.tar.gz.
- Pre-existence checks prevent colliding with an existing archive.
- Refuses execution if application internal scheduler (backup_enabled) is also active.
- Atomically writes persistent backup credentials with fsync.
- Fail-safe: any failure in verification, encryption or transfer halts without pruning.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import tempfile
import uuid

# Cross-platform file locking support
try:
    import fcntl
    def acquire_lock(file_obj):
        fcntl.flock(file_obj, fcntl.LOCK_EX | fcntl.LOCK_NB)
    def release_lock(file_obj):
        fcntl.flock(file_obj, fcntl.LOCK_UN)
except ImportError:
    try:
        import msvcrt
        def acquire_lock(file_obj):
            file_obj.seek(0)
            msvcrt.locking(file_obj.fileno(), msvcrt.LK_NBLCK, 1)
        def release_lock(file_obj):
            try:
                file_obj.seek(0)
                msvcrt.locking(file_obj.fileno(), msvcrt.LK_UNLCK, 1)
            except OSError:
                pass
    except ImportError:
        def acquire_lock(file_obj):
            pass
        def release_lock(file_obj):
            pass


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def resolve_single_container(service_name: str, runner=subprocess.check_output) -> str:
    """Resolve a single running container instance using docker compose labels."""
    try:
        cmd = [
            'docker', 'ps',
            '--filter', f'label=com.docker.compose.service={service_name}',
            '--filter', 'status=running',
            '--format', '{{.ID}}'
        ]
        output = runner(cmd).decode().strip().splitlines()
        ids = [x.strip() for x in output if x.strip()]
    except Exception as e:
        raise RuntimeError(f"Failed to query docker daemon: {e}") from e

    if len(ids) == 0:
        raise RuntimeError(f"NO_CONTAINER_FOUND: No running container found for service '{service_name}'")
    if len(ids) > 1:
        raise RuntimeError(f"MULTIPLE_CONTAINERS_REFUSED: Expected 1 running instance for '{service_name}', found {len(ids)} ({ids}). Dual-instance execution rejected.")

    return ids[0]


def check_app_scheduler_conflict(container_id: str, runner=subprocess.check_output) -> bool:
    """Check if the internal application scheduler is enabled."""
    code = r"""
(async () => {
  const driver = process.env.DATABASE_DRIVER || 'sqlite';
  let enabled;
  if (driver === 'postgres') {
    if (!process.env.POSTGRES_URL) throw Error('configuration');
    const { Pool } = require('pg');
    const pool = new Pool({ connectionString: process.env.POSTGRES_URL, max: 1,
      connectionTimeoutMillis: 1000, statement_timeout: 1000 });
    pool.on('error', () => {});
    try { enabled = (await pool.query("SELECT value FROM main.site_config WHERE key='backup_enabled'")).rows[0]?.value === '1'; }
    finally { await pool.end(); }
  } else if (driver === 'sqlite') {
    const path = require('node:path');
    const { DatabaseSync } = require('node:sqlite');
    const filename = path.resolve(process.env.DATA_DIR || '/app/data', process.env.DB_PATH || 'guatswr_web_main.db');
    const db = new DatabaseSync(filename, { readOnly: true });
    try { enabled = db.prepare("SELECT value FROM site_config WHERE key='backup_enabled'").get()?.value === '1'; }
    finally { db.close(); }
  } else throw Error('configuration');
  console.log(enabled ? '1' : '0');
})().catch(() => { console.error('SCHEDULER_CHECK_FAILED'); process.exitCode = 1; });
"""
    cmd = ['docker', 'exec', container_id, 'node', '-e', code]
    try:
        output = runner(cmd).decode().strip()
        if output not in ('0', '1'):
            raise ValueError('invalid scheduler status')
        return output == '1'
    except Exception as error:
        raise RuntimeError('SCHEDULER_CHECK_FAILED: Cannot establish a single backup scheduler') from error


def generate_backup_tag() -> str:
    """Generate a unique compliant backup tag: YYYYMMDD_HHMMSS_<8-char-hex>."""
    now = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%d_%H%M%S')
    token = uuid.uuid4().hex[:8]
    return f"{now}_{token}"


def verify_archive_target(source_full_dir: Path, tag: str) -> Path:
    """Strictly verify the expected backup archive exists, is not a symlink, and matches tag."""
    expected_name = f"full_{tag}.tar.gz"
    target = source_full_dir / expected_name

    if not target.exists():
        raise FileNotFoundError(f"BACKUP_ARCHIVE_MISSING: Expected archive '{expected_name}' was not produced")
    if target.is_symlink():
        raise ValueError(f"BACKUP_ARCHIVE_UNSAFE: Archive '{expected_name}' is a symbolic link")
    if not target.is_file():
        raise ValueError(f"BACKUP_ARCHIVE_INVALID: Archive '{expected_name}' is not a regular file")
    if target.stat().st_size == 0:
        raise ValueError(f"BACKUP_ARCHIVE_EMPTY: Archive '{expected_name}' has 0 bytes")

    return target


def atomic_write_receipt(destination_file: Path, payload: dict) -> None:
    """Atomically write and fsync receipt payload to disk."""
    destination_file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp_file = destination_file.with_name(f".{destination_file.name}.{uuid.uuid4().hex}.tmp")
    text = json.dumps(payload, indent=2, ensure_ascii=False)
    with open(temp_file, 'w', encoding='utf-8') as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp_file, destination_file)


def run_command(*args, **kwargs):
    return subprocess.run(args, check=True, timeout=1200, **kwargs)


def execute_backup(config: dict, apply: bool = False, runner=run_command) -> dict:
    root = Path(config['work_dir'])
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = root / '.lock'

    with open(lock_path, 'a') as lock_file:
        try:
            acquire_lock(lock_file)
        except (BlockingIOError, OSError) as e:
            raise RuntimeError("BACKUP_ALREADY_RUNNING: Another backup instance holds the lock") from e

        try:
            # 1. Resolve unique backend container
            service_name = config.get('backend_service', 'backend')
            container_id = resolve_single_container(service_name)

            # 2. Check for dual scheduler conflict
            if check_app_scheduler_conflict(container_id):
                if not config.get('allow_internal_scheduler', False):
                    raise RuntimeError("DUAL_SCHEDULER_CONFLICT: Application internal scheduler (backup_enabled=1) is active. Host scheduler refuses duplicate execution.")

            # 3. Dry-run early exit
            if not apply:
                return {
                    'dry_run': True,
                    'container_id': container_id,
                    'destination': config.get('destination', ''),
                    'retention_days': 30,
                    'plan': 'Container verified; conflict check passed; ready for single-owner execution.'
                }

            # 4. Generate unique tag and verify absence of pre-existing conflict
            tag = generate_backup_tag()
            run_id = str(uuid.uuid4())

            # Inspect container to find backup mount path on host
            info = json.loads(subprocess.check_output(['docker', 'inspect', container_id]))[0]
            environment = dict(item.split('=', 1) for item in info.get('Config', {}).get('Env', []) if '=' in item)
            driver = environment.get('DATABASE_DRIVER', 'sqlite')
            if driver not in ('sqlite', 'postgres'):
                raise RuntimeError('DATABASE_DRIVER_INVALID')
            source_mount = Path(next(m['Source'] for m in info['Mounts'] if m['Destination'] == '/app/backups'))
            source_full = source_mount / 'full'
            source_full.mkdir(parents=True, exist_ok=True)

            preexisting = source_full / f"full_{tag}.tar.gz"
            if preexisting.exists():
                raise RuntimeError(f"PREEXISTING_BACKUP_CONFLICT: Archive 'full_{tag}.tar.gz' already exists before execution")

            with tempfile.TemporaryDirectory(prefix='backup-', dir=root) as directory:
                work = Path(directory)

                if driver == 'postgres':
                    runner('docker', 'exec', container_id, 'timeout', '--kill-after=5s', '1200s',
                           'node', '/app/scripts/postgres/cli.mjs', 'create', '--tag', tag,
                           '--output-dir', '/app/backups/postgres')
                    runner('docker', 'exec', container_id, 'node', '/app/scripts/postgres/cli.mjs',
                           'verify', '--bundle', f'/app/backups/postgres/pg_{tag}')
                    partial = source_full / f'.full_{tag}.tar.gz.partial'
                    runner('tar', '-C', str(source_mount / 'postgres'), '-czf', str(partial), f'pg_{tag}')
                    os.replace(partial, preexisting)
                else:
                    runner('docker', 'exec', '-e', f'BACKUP_DATE_TAG={tag}', container_id,
                           'timeout', '--kill-after=5s', '240s', '/bin/bash', '/app/scripts/backup_all.sh')
                archive = verify_archive_target(source_full, tag)
                plaintext_sha = file_sha256(archive)
                if driver == 'sqlite':
                    runner('docker', 'exec', container_id, 'timeout', '--kill-after=5s', '300s',
                           'python3', '/app/scripts/backup_bundle.py', 'verify', f'/app/backups/full/{archive.name}',
                           '--work-dir', '/tmp')

                runner('cp', '--', str(archive), str(work / 'website.tar.gz'))

                # Database dump for umami if present
                umami_db = config.get('umami_db', 'umami-db')
                if umami_db:
                    with open(work / 'umami.sql', 'wb') as output:
                        runner('docker', 'exec', umami_db, 'timeout', '180s',
                               'sh', '-c', 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges',
                               stdout=output)

                # Encrypt archive
                encrypted = root / f"guatswr-{tag}.tar.gpg"
                try:
                    tar_proc = subprocess.Popen(['tar', '-C', str(work), '-cf', '-', '.'], stdout=subprocess.PIPE)
                    try:
                        runner('gpg', '--batch', '--trust-model', 'always', '--recipient', config['gpg_recipient'],
                               '--encrypt', '--output', str(encrypted), stdin=tar_proc.stdout)
                        tar_proc.stdout.close()
                        if tar_proc.wait(timeout=60):
                            raise RuntimeError("ARCHIVE_PIPELINE_FAILED: tar packing failed")
                    finally:
                        if tar_proc.poll() is None:
                            tar_proc.kill()
                            tar_proc.wait()

                    encrypted_sha = file_sha256(encrypted)

                    # Upload to a temporary name, then let the receiver verify
                    # and publish it under its shared ingestion/retention lock.
                    destination = config['destination']
                    prefix = config['ssh_alias'] + ':'
                    if not destination.startswith(prefix):
                        raise ValueError('Backup destination must use the configured SSH alias')
                    remote_root = destination[len(prefix):].rstrip('/')
                    if not remote_root.startswith('/') or remote_root == '':
                        raise ValueError('Absolute remote backup directory required')
                    incoming = remote_root + f'/.guatswr-{tag}.incoming'
                    runner('rsync', '--protect-args', '--chmod=F600', '--', str(encrypted), prefix + incoming)
                    receiver_command = ['python3', '/opt/guatswr-backup/ops_backup_receiver.py', '--root', remote_root]
                    runner('ssh', '-oBatchMode=yes', config['ssh_alias'], shlex.join(receiver_command + [
                        '--receive', incoming, '--sha256', encrypted_sha, '--tag', tag]))

                    # Remote receiver retention
                    runner('ssh', '-oBatchMode=yes', config['ssh_alias'],
                           shlex.join(receiver_command + ['--days', '30', '--minimum', '7', '--apply']))

                    # Local container prune
                    if driver == 'sqlite':
                        runner('docker', 'exec', container_id, 'python3', '/app/scripts/backup_prune.py',
                               '--root', '/app/backups', '--days', '30', '--minimum', '7', '--apply')
                    # PG plaintext bundles are retained until an independently
                    # verified recovery point authorizes explicit retention.

                    receipt = {
                        'format': 'guatswr-backup-receipt-v1',
                        'run_id': run_id,
                        'tag': tag,
                        'created_at': dt.datetime.now(dt.timezone.utc).isoformat(),
                        'container_id': container_id,
                        'source_archive': archive.name,
                        'database_driver': driver,
                        'plaintext_sha256': plaintext_sha,
                        'encrypted_sha256': encrypted_sha,
                        'status': 'accepted',
                    }

                    atomic_write_receipt(root / 'last-success.json', receipt)
                    receipt_file = root / f'guatswr-{tag}.receipt.json'
                    atomic_write_receipt(receipt_file, receipt)
                    return receipt
                finally:
                    encrypted.unlink(missing_ok=True)
        finally:
            release_lock(lock_file)


def main():
    parser = argparse.ArgumentParser(description="Host backup orchestration with identity verification")
    parser.add_argument('--config', type=Path, required=True, help="Path to backup configuration JSON")
    parser.add_argument('--apply', action='store_true', help="Execute real backup and offsite transfer")
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding='utf-8'))
    result = execute_backup(config, apply=args.apply)
    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == '__main__':
    os.umask(0o077)
    main()
