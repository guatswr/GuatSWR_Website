#!/usr/bin/env python3
"""Dedicated offsite backup receiver and retention engine (OPS-02).

Guarantees:
- Atomic ingestion: uploads arrive as temporary files, checksum verified, atomically published.
- Separates transfer receipt from cryptographic restore verification.
- Retention: Keeps 30 days & minimum 7 copies, PLUS protects the last verified recovery point.
- Zero-deletion failsafe: if no verified recovery point exists, destructive pruning is strictly refused.
- Concurrency mutex: Upload ingestion and prune timer share a mutual exclusion lock.
- Provides executable, key-free recovery runbooks.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import uuid
from contextlib import contextmanager

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


FILENAME_PATTERN = re.compile(r'^guatswr-[A-Za-z0-9_.-]+\.tar\.gpg$')
TAG_PATTERN = re.compile(r'^[A-Za-z0-9_.-]+$')


@contextmanager
def receiver_lock(root: Path):
    with open(root / '.receiver.lock', 'a') as lock_file:
        acquire_lock(lock_file)
        try:
            yield
        finally:
            release_lock(lock_file)


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def atomic_write_json(destination: Path, data: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    text = json.dumps(data, indent=2, ensure_ascii=False)
    with open(temp, 'w', encoding='utf-8') as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, destination)


def receive_package(
    root: Path,
    incoming_temp_file: Path,
    expected_sha256: str,
    tag: str,
    metadata: dict = None,
) -> Path:
    """Validate checksum of uploaded incoming package and atomically publish it with a receipt."""
    with receiver_lock(root):
        return _receive_package(root, incoming_temp_file, expected_sha256, tag, metadata)


def _receive_package(root: Path, incoming_temp_file: Path, expected_sha256: str, tag: str, metadata: dict = None) -> Path:
    if not tag or not TAG_PATTERN.fullmatch(tag):
        raise ValueError(f"INVALID_TAG: Tag contains invalid characters or is empty: '{tag}'")
    if not re.fullmatch(r'[A-Fa-f0-9]{64}', expected_sha256 or ''):
        raise ValueError('EXPECTED_CHECKSUM_REQUIRED: SHA-256 is required before publication')
    if incoming_temp_file.parent.resolve() != root.resolve():
        raise ValueError('RECEIVE_PATH_INVALID: Upload must be inside the dedicated receiver directory')
    if not incoming_temp_file.exists() or not incoming_temp_file.is_file():
        raise FileNotFoundError(f"RECEIVE_FILE_MISSING: Temp upload '{incoming_temp_file}' not found")
    if incoming_temp_file.is_symlink():
        raise ValueError("RECEIVE_SYMLINK_REJECTED: Temp upload is a symbolic link")

    actual_sha = file_sha256(incoming_temp_file)
    if expected_sha256 and actual_sha.lower() != expected_sha256.lower():
        incoming_temp_file.unlink(missing_ok=True)
        raise ValueError(f"CHECKSUM_MISMATCH: Expected {expected_sha256}, got {actual_sha}")

    final_name = f"guatswr-{tag}.tar.gpg"
    final_path = root / final_name
    if final_path.exists():
        raise RuntimeError(f"PACKAGE_ALREADY_EXISTS: Target package '{final_name}' already exists")

    # Atomic publication
    os.replace(incoming_temp_file, final_path)

    receipt = {
        'format': 'guatswr-receiver-receipt-v1',
        'tag': tag,
        'package_name': final_name,
        'received_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'encrypted_sha256': actual_sha,
        'status': 'transferred',
        'client_metadata': metadata or {},
    }

    receipt_path = root / f"guatswr-{tag}.receipt.json"
    atomic_write_json(receipt_path, receipt)
    return final_path


def record_recovery_verification(
    root: Path,
    tag: str,
    verified_by: str = 'operator',
    notes: str = '',
) -> Path:
    """Record an authentic, successful decryption and restore verification for a package."""
    if not tag or not TAG_PATTERN.fullmatch(tag):
        raise ValueError(f"INVALID_TAG: Tag contains invalid characters or is empty: '{tag}'")
    target_package = root / f"guatswr-{tag}.tar.gpg"
    if not target_package.exists():
        raise FileNotFoundError(f"Cannot verify nonexistent package for tag: {tag}")

    sha = file_sha256(target_package)
    marker = root / f"guatswr-{tag}.verified.json"
    payload = {
        'format': 'guatswr-receiver-verified-v1',
        'tag': tag,
        'package_name': target_package.name,
        'encrypted_sha256': sha,
        'verified_at': dt.datetime.now(dt.timezone.utc).isoformat(),
        'verified_by': verified_by,
        'notes': notes,
    }
    atomic_write_json(marker, payload)
    return marker


def plan(root: Path, days: int = 30, minimum: int = 7, now: float = None) -> list[Path]:
    """Calculate candidates for retention. Always preserves:

    1. At least `minimum` newest copies;
    2. Any copies younger than `days`;
    3. THE LAST KNOWN VERIFIED RECOVERY POINT (regardless of age);
    4. Refuses destructive pruning if zero verified points exist.
    """
    if days < 1 or minimum < 2:
        raise ValueError("unsafe retention policy: days must be >= 1 and minimum >= 2")

    current_time = time.time() if now is None else now

    # Gather regular non-symlink encrypted packages
    packages = []
    for p in root.iterdir():
        if p.is_file() and not p.is_symlink() and FILENAME_PATTERN.fullmatch(p.name):
            packages.append(p)

    # Sort descending by mtime (newest first)
    packages.sort(key=lambda p: p.stat().st_mtime, reverse=True)

    if not packages:
        return []

    # Find verified packages
    packages_by_name = {p.name: p for p in packages}
    verified_packages = set()
    for marker in root.glob('guatswr-*.verified.json'):
        if marker.is_symlink():
            continue
        try:
            data = json.loads(marker.read_text(encoding='utf-8'))
            if data.get('format') == 'guatswr-receiver-verified-v1':
                pkg_name = data.get('package_name')
                pkg_path = packages_by_name.get(pkg_name)
                if pkg_path is not None and marker.name == pkg_name.replace('.tar.gpg', '.verified.json'):
                    # Only a package in this receiver's managed namespace can
                    # serve as the recovery point that authorizes retention.
                    if file_sha256(pkg_path) == data.get('encrypted_sha256'):
                        verified_packages.add(pkg_path)
        except Exception:
            continue

    # FAIL-SAFE: If no verified point exists at all, refuse pruning to protect data
    if not verified_packages:
        raise RuntimeError("RETENTION_REFUSED_NO_VERIFIED_POINT: No verified full recovery point found; destructive cleanup refused.")

    # The most recent verified package must NEVER be pruned, even if older than 30 days
    last_verified = max(verified_packages, key=lambda p: p.stat().st_mtime)

    # Retention evaluation
    candidates_to_prune = []
    for p in packages[minimum:]:
        if p == last_verified:
            continue
        age_seconds = current_time - p.stat().st_mtime
        if age_seconds > (days * 86400):
            candidates_to_prune.append(p)

    return candidates_to_prune


def generate_recovery_runbook(archive_path: Path) -> str:
    """Generate executable, key-free operator instructions for disaster recovery."""
    name = archive_path.name
    return f"""# ==============================================================================
# DISASTER RECOVERY RUNBOOK FOR {name}
# ==============================================================================
# Step 1: Verify archive integrity
sha256sum {name}

# Step 2: Decrypt archive (using dedicated recovery gpg private key)
gpg --decrypt --output website_restored.tar {name}

# Step 3: Extract archive into clean temporary staging
mkdir -p /tmp/guatswr_restore && tar -xf website_restored.tar -C /tmp/guatswr_restore

# Step 4: Verify decrypted bundle integrity
python3 backend/scripts/backup_bundle.py verify /tmp/guatswr_restore/website.tar.gz --work-dir /tmp

# Step 5: Restore bundle to application recovery directory
python3 backend/scripts/backup_bundle.py restore /tmp/guatswr_restore/website.tar.gz \\
    --target /tmp/guatswr_restore/extracted

# Step 6: If umami database is present, restore PostgreSQL database
if [ -f /tmp/guatswr_restore/umami.sql ]; then
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" < /tmp/guatswr_restore/umami.sql
fi
# ==============================================================================
"""


def main():
    parser = argparse.ArgumentParser(description="Dedicated offsite backup receiver and retention engine")
    parser.add_argument('--root', type=Path, required=True, help="Dedicated storage root directory")
    parser.add_argument('--days', type=int, default=30, help="Retention period in days (default: 30)")
    parser.add_argument('--minimum', type=int, default=7, help="Minimum number of newest archives to retain (default: 7)")
    parser.add_argument('--apply', action='store_true', help="Perform actual deletion of pruned packages")
    parser.add_argument('--runbook', type=Path, help="Generate recovery runbook for specified package")
    parser.add_argument('--receive', type=Path, help="Verify and publish a temporary uploaded package")
    parser.add_argument('--sha256', help="Expected SHA-256 of the encrypted package")
    parser.add_argument('--tag', help="Host-generated tag for the received package")
    args = parser.parse_args()

    if not args.root.is_absolute() or args.root.is_symlink():
        raise ValueError("absolute dedicated directory required")

    args.root.mkdir(parents=True, exist_ok=True, mode=0o700)
    lock_path = args.root / '.receiver.lock'

    if args.receive:
        if not args.tag or not args.sha256:
            parser.error('--receive requires --tag and --sha256')
        package = receive_package(args.root, args.receive, args.sha256, args.tag)
        print(json.dumps({'received': package.name}))
        return

    if args.runbook:
        print(generate_recovery_runbook(args.runbook))
        return

    with open(lock_path, 'a') as lock_file:
        try:
            acquire_lock(lock_file)
        except (BlockingIOError, OSError) as e:
            raise RuntimeError("RECEIVER_LOCKED: Another receiver or pruning operation is running") from e

        try:
            targets = plan(args.root, args.days, args.minimum)
            for target in targets:
                print(json.dumps({'delete' if args.apply else 'would_delete': target.name}))
                if args.apply:
                    target.unlink(missing_ok=True)
                    # Clean associated sidecars
                    target.with_name(target.name.replace('.tar.gpg', '.receipt.json')).unlink(missing_ok=True)
                    target.with_name(target.name.replace('.tar.gpg', '.verified.json')).unlink(missing_ok=True)
        except RuntimeError as e:
            if 'RETENTION_REFUSED_NO_VERIFIED_POINT' in str(e):
                print(json.dumps({'warning': str(e), 'retained_all': True}), file=sys.stderr)
                return
            raise
        finally:
            release_lock(lock_file)


if __name__ == '__main__':
    main()
