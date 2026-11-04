import importlib.util
from pathlib import Path
import tempfile
import unittest
import os
import subprocess
import sys

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).with_name('ops_backup_receiver.py'))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)

class RetentionTest(unittest.TestCase):
    def test_old_only_minimum_and_namespace(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for day in range(1, 13):
                p = root / f'guatswr-202601{day:02d}T000000Z.tar.gpg'
                p.write_text('test')
                os.utime(p, (0, 0))
            (root / 'unrelated.tar.gpg').write_text('keep')
            targets = receiver.plan(root, days=30, minimum=7, now=86400*60)
            self.assertEqual(len(targets), 5)
            self.assertEqual(targets[-1].name, 'guatswr-20260101T000000Z.tar.gpg')
            self.assertNotIn(root / 'unrelated.tar.gpg', targets)
            self.assertEqual(receiver.plan(root, now=1), [])
    def test_unsafe_policy_refused(self):
        with self.assertRaises(ValueError):
            receiver.plan(Path('.'), minimum=0)

class LocalRetentionTest(unittest.TestCase):
    def test_keeps_last_verified_even_when_oldest(self):
        spec = importlib.util.spec_from_file_location('bundle', Path(__file__).parent.parent / 'backend/scripts/backup_bundle.py')
        bundle = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(bundle)
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for kind in ['full', 'db', 'uploads']:
                (root / kind).mkdir()
            for day in range(1, 13):
                archive = root / f'full/full_202601{day:02d}_000000.tar.gz'
                archive.write_text('synthetic bytes')
                os.utime(archive, (day * 86400, day * 86400))
            protected = root / 'full/full_20260101_000000.tar.gz'
            import json
            marker = protected.with_name(protected.name + '.verified.json')
            marker.write_text(json.dumps({'format': 'guatswr-verified-backup', 'source_identity': bundle.verification_identity(protected), 'source_sha256': bundle.digest(protected)}))
            command = [sys.executable, str(Path(__file__).parent.parent / 'backend/scripts/backup_prune.py'), '--root', str(root)]
            self.assertEqual(subprocess.run(command, capture_output=True).returncode, 0)
            self.assertEqual(len(list((root / 'full').glob('*.tar.gz'))), 12)
            result = subprocess.run(command + ['--apply'], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue(protected.exists())
            self.assertTrue(marker.exists())
            self.assertEqual(len(list((root / 'full').glob('*.tar.gz'))), 8)

    def test_no_verified_point_refuses_without_deleting(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for kind in ['full', 'db', 'uploads']:
                (root / kind).mkdir()
            archive = root / 'full/full_20260101_000000.tar.gz'
            archive.write_text('unverified')
            result = subprocess.run([sys.executable, str(Path(__file__).parent.parent / 'backend/scripts/backup_prune.py'), '--root', str(root), '--apply'], capture_output=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertTrue(archive.exists())
            self.assertFalse(list(root.glob('*/.backup-retention.lock')))

if __name__ == '__main__':
    unittest.main()
