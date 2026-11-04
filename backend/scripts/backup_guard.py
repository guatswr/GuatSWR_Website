#!/usr/bin/env python3
"""Linux backup supervisor: kernel lock releases on crash; managed fences recover."""
import fcntl
import os
from pathlib import Path
import subprocess
import sys

root = Path(os.environ['DATA_DIR'])
lock = open(root / '.backup-process.lock', 'a')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(75)
fence = root / '.asset-cleanup-fence'
marker = fence / 'backup-guard-v1'
if fence.exists():
    # Unknown/legacy fences are never guessed stale.
    if not marker.is_file() or set(p.name for p in fence.iterdir()) != {'backup-guard-v1'}:
        sys.exit(75)
    marker.unlink()
    fence.rmdir()
fence.mkdir(mode=0o700)
marker.write_text('managed by backup_guard.py\n')
try:
    # Child inherits the kernel lock: killing the supervisor alone cannot unlock
    # a still-running backup. A process-group kill releases all descriptors.
    result = subprocess.run(sys.argv[1:], pass_fds=(lock.fileno(),))
finally:
    marker.unlink()
    fence.rmdir()
sys.exit(result.returncode)
