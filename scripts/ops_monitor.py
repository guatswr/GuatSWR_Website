#!/usr/bin/env python3
"""Read-only external probes + backup freshness + disk budget + notification engine (OPS-03).

Features:
- Positive content assertion for homepage (prohibits arbitrary 200).
- Readiness check validating exact service and status: ok.
- Static asset probe validating non-empty image content and content-type.
- Backup freshness evaluated strictly via bound receipts/verified markers (not raw mtime).
- 3 consecutive failures before alerting, 1-hour periodic reminders, 1 recovery notice.
- Notification failures are never falsely recorded as sent (enables prompt retry).
- Atomic state persistence with fsync.
- Process mutex locking preventing overlapping cron executions.
- Reports BLOCKED_EXTERNAL when notification webhook is unconfigured.
"""
import argparse
import datetime as dt
import json
import hashlib
import math
import os
from pathlib import Path
import shutil
import sys
import time
import urllib.error
import urllib.request
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


def parse_iso_or_timestamp(val) -> float:
    """Parse ISO8601 string or numeric timestamp to epoch seconds."""
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, str):
        # Handle trailing Z
        val_clean = val.replace('Z', '+00:00')
        return dt.datetime.fromisoformat(val_clean).timestamp()
    raise ValueError(f"Unrecognized timestamp value: {val}")


def atomic_write_json(destination: Path, data: dict) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
    text = json.dumps(data, indent=2, ensure_ascii=False)
    with open(temp, 'w', encoding='utf-8') as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(temp, destination)


def evaluate_probe(probe: dict, opener=None) -> None:
    """Evaluate a single probe. Raises ValueError on any discrepancy."""
    url = probe['url']
    request = urllib.request.Request(
        url,
        headers={'Cache-Control': 'no-cache', 'User-Agent': 'GuatSWR-Monitor/1'}
    )
    fetcher = opener if opener is not None else urllib.request.urlopen

    with fetcher(request, timeout=5) as response:
        status_code = getattr(response, 'status', 200)
        if status_code != 200:
            raise ValueError(f"HTTP status {status_code} != 200")

        # Check content-type if requested
        if probe.get('content_type'):
            ct = response.headers.get('Content-Type', '') if hasattr(response, 'headers') else ''
            if probe['content_type'].lower() not in ct.lower():
                raise ValueError(f"Content-Type '{ct}' does not match '{probe['content_type']}'")

        body = response.read(1048577)
        if len(body) > 1048576:
            raise ValueError("Response body exceeded 1 MiB limit")

        # Minimum bytes check (crucial for static image probe)
        if probe.get('min_bytes') and len(body) < probe['min_bytes']:
            raise ValueError(f"Body length {len(body)} < min_bytes {probe['min_bytes']}")

        # Content assertion check (prohibits arbitrary 200)
        if probe.get('contains'):
            required_snippet = probe['contains'].encode('utf-8')
            if required_snippet not in body:
                raise ValueError(f"Required content snippet '{probe['contains']}' not found in body")

        # Readiness check (requires JSON with exact service & status=ok)
        if probe.get('service'):
            try:
                parsed = json.loads(body.decode('utf-8'))
            except Exception as e:
                raise ValueError(f"Invalid JSON in readiness response: {e}") from e

            if parsed.get('service') != probe['service']:
                raise ValueError(f"Service '{parsed.get('service')}' != expected '{probe['service']}'")
            if parsed.get('status') not in ('ok', 'ready'):
                raise ValueError(f"Service status '{parsed.get('status')}' != 'ok'/'ready'")


def evaluate_backup_freshness(backup: dict, now: float = None) -> bool:
    """Evaluate backup freshness using bound receipts/verified markers.

    Returns True if healthy, False if stale or missing.
    """
    current_time = time.time() if now is None else now
    root = Path(backup['root'])
    if not root.exists() or not root.is_dir():
        return False

    max_age_seconds = backup.get('max_age_hours', 30) * 3600
    pattern = backup.get('pattern', 'guatswr-*.tar.gpg')

    # Look for matching packages
    packages = [p for p in root.glob(pattern) if p.is_file() and not p.is_symlink()]
    if not packages:
        return False

    packages_by_name = {p.name: p for p in packages}
    receipt_files = list(root.glob('guatswr-*.receipt.json')) + list(root.glob('guatswr-*.verified.json'))
    last_success = root / 'last-success.json'
    if last_success.is_file() and not last_success.is_symlink():
        receipt_files.append(last_success)

    for receipt_path in receipt_files:
        if receipt_path.is_symlink():
            continue
        try:
            data = json.loads(receipt_path.read_text(encoding='utf-8'))
            receipt_format = data.get('format')
            if receipt_format == 'guatswr-receiver-receipt-v1' and data.get('status') == 'transferred':
                timestamp = data.get('received_at')
            elif receipt_format == 'guatswr-receiver-verified-v1':
                timestamp = data.get('verified_at')
            elif receipt_format == 'guatswr-backup-receipt-v1' and data.get('status') == 'accepted':
                timestamp = data.get('created_at')
            else:
                continue
            ts = parse_iso_or_timestamp(timestamp)
            if not math.isfinite(ts) or not 0 <= current_time - ts <= max_age_seconds:
                continue
            tag = data.get('tag')
            if not isinstance(tag, str) or not tag:
                continue
            package_name = f'guatswr-{tag}.tar.gpg'
            if data.get('package_name', package_name) != package_name:
                continue
            package = packages_by_name.get(package_name)
            expected_sha = data.get('encrypted_sha256')
            if package is None or not isinstance(expected_sha, str) or len(expected_sha) != 64:
                continue
            digest = hashlib.sha256()
            with package.open('rb') as source:
                while chunk := source.read(1024 * 1024):
                    digest.update(chunk)
            if digest.hexdigest() == expected_sha.lower():
                return True
        except (OSError, ValueError, TypeError, AttributeError, OverflowError):
            continue
    return False



def collect(config: dict, opener=None, now: float = None) -> list[str]:
    """Collect issues across probes, disks, and backups."""
    issues = []

    # Probes
    for probe in config.get('probes', []):
        try:
            evaluate_probe(probe, opener=opener)
        except Exception:
            issues.append('probe:' + probe['name'])

    # Disk usage
    for folder in config.get('disks', []):
        try:
            total, used, free = shutil.disk_usage(folder)
            if total > 0 and (free / total) < config.get('disk_free_ratio', 0.15):
                issues.append('disk:' + folder)
        except Exception:
            issues.append('disk:' + folder)

    # Backups
    for backup in config.get('backups', []):
        if not evaluate_backup_freshness(backup, now=now):
            issues.append('backup:' + backup['name'])

    return sorted(issues)


def send_notification(webhook_url: str, message: str, poster=None) -> None:
    """Send notification to webhook. Raises on network/HTTP error."""
    payload = json.dumps({'text': message}).encode('utf-8')
    request = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={'Content-Type': 'application/json', 'User-Agent': 'GuatSWR-Monitor/1'},
        method='POST'
    )
    fetcher = poster if poster is not None else urllib.request.urlopen
    with fetcher(request, timeout=10) as response:
        status_code = getattr(response, 'status', 200)
        if not (200 <= status_code < 300):
            raise RuntimeError(f"Notification POST failed with HTTP status {status_code}")


def run_cycle(config: dict, state_path: Path, opener=None, poster=None, now: float = None) -> dict:
    """Execute one monitoring cycle with concurrency lock and atomic state persistence."""
    current_time = time.time() if now is None else now
    lock_file_path = state_path.with_name(f".{state_path.name}.lock")
    lock_file_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)

    with open(lock_file_path, 'a') as lock_f:
        try:
            acquire_lock(lock_f)
        except (BlockingIOError, OSError) as e:
            raise RuntimeError("MONITOR_LOCKED: Another monitor process is currently running") from e

        try:
            issues = collect(config, opener=opener, now=current_time)

            previous = {}
            if state_path.exists() and not state_path.is_symlink():
                try:
                    previous = json.loads(state_path.read_text(encoding='utf-8'))
                except Exception:
                    previous = {}

            prev_counts = previous.get('counts', {})
            prev_notified_active = previous.get('notified_active', [])
            prev_sent = previous.get('sent', 0)

            # Update failure counts: increment active failures, reset resolved issues
            counts = {}
            for issue in issues:
                counts[issue] = prev_counts.get(issue, 0) + 1

            # An issue is active if it has failed consecutively >= 3 times
            active = sorted([issue for issue in issues if counts[issue] >= 3])

            # Notification rules:
            # 1. Any active issue that hasn't been successfully notified yet
            # 2. Recovery: all active issues cleared after having previously notified
            # 3. 1-hour periodic reminder if issues remain active >= 3600s since last successful send
            has_unnotified_active = any(iss not in prev_notified_active for iss in active)
            is_recovered = (not active and len(prev_notified_active) > 0)
            is_hourly_reminder = bool(active and prev_notified_active and (current_time - prev_sent >= 3600))

            should_notify = has_unnotified_active or is_recovered or is_hourly_reminder

            webhook = config.get('webhook', '').strip()
            notification_status = "CONFIGURED" if webhook else "BLOCKED_EXTERNAL"

            sent_time = prev_sent
            notified_active = prev_notified_active
            if should_notify and webhook:
                msg_body = "GuatSWR: recovered" if is_recovered else f"GuatSWR ALERT: {', '.join(active)}"
                try:
                    send_notification(webhook, msg_body, poster=poster)
                    # ONLY update sent time and notified active set on actual HTTP success
                    sent_time = current_time
                    notified_active = [] if is_recovered else list(active)
                except Exception as notify_err:
                    # Notification failed: do NOT update sent_time/notified_active, ensuring prompt retry
                    print(f"WARN: Failed to deliver notification: {notify_err}", file=sys.stderr)

            # Atomically save state
            new_state = {
                'counts': counts,
                'active': active,
                'notified_active': notified_active,
                'sent': sent_time,
                'last_run': current_time,
            }
            atomic_write_json(state_path, new_state)

            return {
                'issues': issues,
                'active': active,
                'notification_status': notification_status,
                'notified': (sent_time == current_time and should_notify and bool(webhook)),
            }
        finally:
            release_lock(lock_f)


def main():
    parser = argparse.ArgumentParser(description="GuatSWR OPS-03 Business Probes and Watchdog Monitor")
    parser.add_argument('--config', type=Path, required=True, help="Path to monitor config JSON")
    parser.add_argument('--state', type=Path, required=True, help="Path to monitor state JSON")
    args = parser.parse_args()

    config = json.loads(args.config.read_text(encoding='utf-8'))
    result = run_cycle(config, args.state)
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    os.umask(0o077)
    main()
