#!/usr/bin/env python3
"""Read-only external probes + backup freshness + disk budget. Optional webhook."""
import argparse
import json
import os
from pathlib import Path
import shutil
import time
import urllib.request


def collect(config):
    issues = []
    for probe in config.get('probes', []):
        try:
            request = urllib.request.Request(probe['url'], headers={'Cache-Control': 'no-cache', 'User-Agent': 'GuatSWR-Monitor/1'})
            with urllib.request.urlopen(request, timeout=5) as response:
                body = response.read(1048577)
                if len(body) > 1048576 or response.status != 200:
                    raise ValueError('response')
                if probe.get('contains') and probe['contains'].encode() not in body:
                    raise ValueError('content')
                if probe.get('service') and (json.loads(body).get('service') != probe['service'] or json.loads(body).get('status') != 'ok'):
                    raise ValueError('readiness')
        except Exception:
            issues.append('probe:' + probe['name'])
    for folder in config.get('disks', []):
        total, used, free = shutil.disk_usage(folder)
        if free / total < config.get('disk_free_ratio', 0.15):
            issues.append('disk:' + folder)
    for backup in config.get('backups', []):
        files = [p for p in Path(backup['root']).glob(backup['pattern']) if p.is_file() and not p.is_symlink()]
        if not files or time.time() - max(p.stat().st_mtime for p in files) > backup.get('max_age_hours', 30) * 3600:
            issues.append('backup:' + backup['name'])
    return sorted(issues)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', type=Path, required=True)
    parser.add_argument('--state', type=Path, required=True)
    args = parser.parse_args()
    config = json.loads(args.config.read_text())
    issues = collect(config)
    previous = json.loads(args.state.read_text()) if args.state.exists() else {}
    now = time.time()
    # Require consecutive bad checks, but send recovery immediately.
    counts = {issue: previous.get('counts', {}).get(issue, 0) + 1 for issue in issues}
    active = [issue for issue in issues if counts[issue] >= 3]
    notify = active != previous.get('active', []) or (active and now - previous.get('sent', 0) >= 3600)
    sent = previous.get('sent', 0)
    if notify and config.get('webhook'):
        payload = json.dumps({'text': 'GuatSWR: ' + (', '.join(active) if active else 'recovered')}).encode()
        request = urllib.request.Request(config['webhook'], data=payload, headers={'Content-Type': 'application/json'}, method='POST')
        with urllib.request.urlopen(request, timeout=10) as response:
            if not 200 <= response.status < 300:
                raise RuntimeError('notification failed')
        sent = now
    args.state.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = args.state.with_suffix('.tmp')
    temporary.write_text(json.dumps({'counts': counts, 'active': active, 'sent': sent}))
    os.replace(temporary, args.state)
    print(json.dumps({'issues': issues, 'active': active, 'notification_configured': bool(config.get('webhook'))}))


if __name__ == '__main__':
    os.umask(0o077)
    main()
