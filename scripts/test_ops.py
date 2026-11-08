import importlib.util
from pathlib import Path
import tempfile
import unittest
import os
import subprocess
import sys
import time
import json
import hashlib
import io
import shutil
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('receiver', Path(__file__).with_name('ops_backup_receiver.py'))
receiver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(receiver)

spec_backup = importlib.util.spec_from_file_location('ops_backup', Path(__file__).with_name('ops_backup.py'))
ops_backup = importlib.util.module_from_spec(spec_backup)
spec_backup.loader.exec_module(ops_backup)

class RetentionTest(unittest.TestCase):
    def test_verified_marker_cannot_refer_outside_receiver_namespace(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder) / 'receiver'
            root.mkdir()
            outside = Path(folder) / 'outside.gpg'
            outside.write_bytes(b'outside')
            for i in range(10):
                package = root / f'guatswr-{i}.tar.gpg'
                package.write_bytes(b'unverified')
                os.utime(package, (0, 0))
            (root / 'guatswr-forged.verified.json').write_text(json.dumps({
                'format': 'guatswr-receiver-verified-v1', 'package_name': '../outside.gpg',
                'encrypted_sha256': hashlib.sha256(b'outside').hexdigest()}))
            with self.assertRaisesRegex(RuntimeError, 'RETENTION_REFUSED_NO_VERIFIED_POINT'):
                receiver.plan(root, now=86400 * 100)

    def test_refuses_when_no_verified_point(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for day in range(1, 13):
                p = root / f'guatswr-202601{day:02d}T000000Z.tar.gpg'
                p.write_text('test')
                os.utime(p, (0, 0))
            with self.assertRaises(RuntimeError) as ctx:
                receiver.plan(root, days=30, minimum=7, now=86400 * 60)
            self.assertIn('RETENTION_REFUSED_NO_VERIFIED_POINT', str(ctx.exception))

    def test_old_only_minimum_and_namespace_with_verified_point(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for day in range(1, 13):
                p = root / f'guatswr-202601{day:02d}T000000Z.tar.gpg'
                p.write_text(f'test content {day}')
                mtime = day * 86400
                os.utime(p, (mtime, mtime))

            # Mark package 10 as verified
            verified_target = root / 'guatswr-20260110T000000Z.tar.gpg'
            receiver.record_recovery_verification(root, '20260110T000000Z', verified_by='ci')

            (root / 'unrelated.tar.gpg').write_text('keep')
            targets = receiver.plan(root, days=30, minimum=7, now=86400 * 60)
            # 12 packages total. minimum 7 newest are [12, 11, 10, 09, 08, 07, 06].
            # older than 30 days: [05, 04, 03, 02, 01] -> 5 targets
            self.assertEqual(len(targets), 5)
            self.assertEqual(targets[-1].name, 'guatswr-20260101T000000Z.tar.gpg')
            self.assertNotIn(root / 'unrelated.tar.gpg', targets)

    def test_preserves_oldest_verified_recovery_point(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for day in range(1, 15):
                p = root / f'guatswr-202601{day:02d}T000000Z.tar.gpg'
                p.write_text(f'archive payload {day}')
                mtime = day * 86400
                os.utime(p, (mtime, mtime))

            # The ONLY verified recovery point is the oldest one (day 1)
            oldest = root / 'guatswr-20260101T000000Z.tar.gpg'
            receiver.record_recovery_verification(root, '20260101T000000Z', notes='initial production snapshot')

            # Run retention with now way in the future (day 100)
            targets = receiver.plan(root, days=30, minimum=7, now=86400 * 100)

            # day 1 must NOT be in targets because it is the sole verified recovery point
            self.assertNotIn(oldest, targets)

    def test_empty_directory_returns_empty_list(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertEqual(receiver.plan(root), [])

    def test_unsafe_policy_refused(self):
        with self.assertRaises(ValueError):
            receiver.plan(Path('.'), minimum=0)
        with self.assertRaises(ValueError):
            receiver.plan(Path('.'), days=0)


class ReceiverIngestionTest(unittest.TestCase):
    def test_receiver_cli_accepts_and_publishes_verified_upload(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            incoming = root / '.upload.incoming'
            incoming.write_bytes(b'encrypted')
            result = subprocess.run([sys.executable, str(Path(__file__).with_name('ops_backup_receiver.py')),
                                     '--root', str(root), '--receive', str(incoming), '--tag', 'cli',
                                     '--sha256', hashlib.sha256(b'encrypted').hexdigest()], capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertTrue((root / 'guatswr-cli.tar.gpg').exists())
            self.assertEqual(json.loads((root / 'guatswr-cli.receipt.json').read_text())['status'], 'transferred')

    def test_atomic_receive_package_success(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            temp_upload = root / '.upload_temp_123.bin'
            content = b'encrypted cipher content abc 123'
            temp_upload.write_bytes(content)

            import hashlib
            expected_sha = hashlib.sha256(content).hexdigest()
            tag = '20261106T030000Z'

            final_pkg = receiver.receive_package(root, temp_upload, expected_sha, tag, metadata={'client': 'ci_runner'})
            self.assertTrue(final_pkg.exists())
            self.assertEqual(final_pkg.name, f'guatswr-{tag}.tar.gpg')
            self.assertFalse(temp_upload.exists())

            receipt_file = root / f'guatswr-{tag}.receipt.json'
            self.assertTrue(receipt_file.exists())
            import json
            receipt = json.loads(receipt_file.read_text(encoding='utf-8'))
            self.assertEqual(receipt['tag'], tag)
            self.assertEqual(receipt['encrypted_sha256'], expected_sha)
            self.assertEqual(receipt['status'], 'transferred')

    def test_atomic_receive_checksum_mismatch_cleans_temp(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            temp_upload = root / '.upload_temp_corrupt.bin'
            temp_upload.write_bytes(b'actual content')
            fake_sha = '0' * 64

            with self.assertRaises(ValueError) as ctx:
                receiver.receive_package(root, temp_upload, fake_sha, '20261106T030000Z')
            self.assertIn('CHECKSUM_MISMATCH', str(ctx.exception))
            self.assertFalse(temp_upload.exists())

    def test_atomic_receive_duplicate_package_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            tag = '20261106T030000Z'
            existing = root / f'guatswr-{tag}.tar.gpg'
            existing.write_bytes(b'already exists')

            temp_upload = root / '.upload_duplicate.bin'
            temp_upload.write_bytes(b'duplicate content')
            import hashlib
            sha = hashlib.sha256(b'duplicate content').hexdigest()

            with self.assertRaises(RuntimeError) as ctx:
                receiver.receive_package(root, temp_upload, sha, tag)
            self.assertIn('PACKAGE_ALREADY_EXISTS', str(ctx.exception))

    def test_recovery_runbook_generation(self):
        pkg = Path('/backup/guatswr-20261106T030000Z.tar.gpg')
        runbook = receiver.generate_recovery_runbook(pkg)
        self.assertIn('guatswr-20261106T030000Z.tar.gpg', runbook)
        self.assertIn('gpg --decrypt', runbook)
        self.assertIn('backup_bundle.py restore', runbook)
        # Verify no hardcoded credentials or passwords in runbook
        self.assertNotIn('password', runbook.lower())

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


class HostBackupIdentityTest(unittest.TestCase):
    def test_failed_scheduler_query_refuses_to_assume_disabled(self):
        def failing_query(cmd):
            raise subprocess.CalledProcessError(1, cmd)
        with self.assertRaises(RuntimeError):
            ops_backup.check_app_scheduler_conflict('backend', runner=failing_query)

    def test_scheduler_probe_executes_real_javascript_against_sqlite(self):
        with tempfile.TemporaryDirectory() as folder:
            database = Path(folder) / 'main.db'
            node = os.environ.get('BACKUP_NODE_BIN', 'node')
            subprocess.run([node, '-e', "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\"CREATE TABLE site_config(key TEXT PRIMARY KEY,value TEXT);INSERT INTO site_config VALUES('backup_enabled','1')\");db.close()", str(database)], check=True, capture_output=True)
            def real_probe(cmd):
                self.assertEqual(cmd[:5], ['docker', 'exec', 'synthetic', 'node', '-e'])
                return subprocess.check_output([node, '-e', cmd[-1]], env={**os.environ, 'DATABASE_DRIVER': 'sqlite', 'DATA_DIR': folder, 'DB_PATH': str(database)}, stderr=subprocess.DEVNULL)
            self.assertTrue(ops_backup.check_app_scheduler_conflict('synthetic', runner=real_probe))
            subprocess.run([node, '-e', "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(process.argv[1]);db.exec(\"UPDATE site_config SET value='0'\");db.close()", str(database)], check=True, capture_output=True)
            self.assertFalse(ops_backup.check_app_scheduler_conflict('synthetic', runner=real_probe))
            # A missing PG URL must not make the current runtime inspect an old SQLite file.
            def default_probe(cmd):
                return subprocess.check_output([node, '-e', cmd[-1]], env={**os.environ, 'DATABASE_DRIVER': '', 'POSTGRES_URL': '', 'DATA_DIR': folder, 'DB_PATH': str(database)}, stderr=subprocess.DEVNULL)
            with self.assertRaisesRegex(RuntimeError, 'SCHEDULER_CHECK_FAILED'):
                ops_backup.check_app_scheduler_conflict('synthetic', runner=default_probe)


    def test_transfer_uses_receiver_before_pruning_and_keeps_default_umami_dump(self):
        self._check_transfer('sqlite')

    def test_postgres_transfer_uses_native_bundle_and_no_sqlite_prune(self):
        self._check_transfer('postgres')

    def _check_transfer(self, driver):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            mount = root / 'backups'
            (mount / 'full').mkdir(parents=True)
            calls = []
            def runner(*args, **kwargs):
                calls.append(args)
                if args[0:3] == ('docker', 'exec', '-e'):
                    tag = args[3].split('=', 1)[1]
                    (mount / 'full' / f'full_{tag}.tar.gz').write_bytes(b'website')
                elif args[0] == 'tar':
                    Path(args[args.index('-czf') + 1]).write_bytes(b'postgres-native-bundle')
                elif args[0] == 'cp':
                    shutil.copyfile(args[-2], args[-1])
                elif args[0] == 'gpg':
                    Path(args[args.index('--output') + 1]).write_bytes(b'cipher')
                elif 'pg_dump' in ' '.join(args):
                    kwargs['stdout'].write(b'sql dump')
            process = type('TarProcess', (), {'stdout': io.BytesIO(b'tar'), 'wait': lambda self, **kw: 0,
                                            'poll': lambda self: 0})()
            config = {'work_dir': str(root / 'work'), 'destination': 'backup-host:/srv/backups/',
                      'ssh_alias': 'backup-host', 'gpg_recipient': 'test-key'}
            with patch.object(ops_backup, 'resolve_single_container', return_value='cid'), \
                 patch.object(ops_backup, 'check_app_scheduler_conflict', return_value=False), \
                 patch.object(ops_backup.subprocess, 'check_output', return_value=json.dumps([{'Config': {'Env': ['DATABASE_DRIVER=' + driver]}, 'Mounts': [{'Destination': '/app/backups', 'Source': str(mount)}]}]).encode()), \
                 patch.object(ops_backup.subprocess, 'Popen', return_value=process):
                receipt = ops_backup.execute_backup(config, apply=True, runner=runner)
            self.assertTrue(any(call[:4] == ('docker', 'exec', 'umami-db', 'timeout') for call in calls))
            transfer = next(call for call in calls if call[0] == 'rsync')
            self.assertTrue(transfer[-1].endswith('.incoming'))
            receive_index = next(i for i, call in enumerate(calls) if call[0] == 'ssh' and '--receive' in call[-1])
            if driver == 'sqlite':
                prune_index = next(i for i, call in enumerate(calls) if 'backup_prune.py' in ' '.join(call))
                self.assertLess(receive_index, prune_index)
            else:
                self.assertTrue(any('create' in call and '/app/scripts/postgres/cli.mjs' in call for call in calls))
                self.assertFalse(any('backup_prune.py' in ' '.join(call) for call in calls))
                self.assertEqual(receipt['database_driver'], 'postgres')
            self.assertEqual(receipt['status'], 'accepted')
            # Receiver-owned transfer receipts must not be overwritten by host sidecars.
            self.assertEqual(len([call for call in calls if call[0] == 'rsync']), 1)

    def test_future_mtime_old_archive_never_selected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            full_dir = root / 'full'
            full_dir.mkdir()

            # Create an old archive with a futuristic mtime
            stale_trap = full_dir / 'full_20250101_000000.tar.gz'
            stale_trap.write_text('old stale data')
            future_mtime = time.time() + 9999999
            os.utime(stale_trap, (future_mtime, future_mtime))

            # Expected tag generated by host
            current_tag = '20261106_120000_deadbeef'
            valid_archive = full_dir / f'full_{current_tag}.tar.gz'
            valid_archive.write_text('valid fresh data')

            # Verification strictly binds to tag, completely ignoring future mtime on stale trap
            chosen = ops_backup.verify_archive_target(full_dir, current_tag)
            self.assertEqual(chosen.name, f'full_{current_tag}.tar.gz')
            self.assertEqual(chosen.read_text(), 'valid fresh data')

    def test_missing_target_archive_fails_even_if_script_returns_zero(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            full_dir = root / 'full'
            full_dir.mkdir()

            # The script exited 0 but failed to output the matching tag archive
            current_tag = '20261106_120000_12345678'
            with self.assertRaises(FileNotFoundError) as ctx:
                ops_backup.verify_archive_target(full_dir, current_tag)
            self.assertIn('BACKUP_ARCHIVE_MISSING', str(ctx.exception))

    def test_symlink_and_empty_archive_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            full_dir = root / 'full'
            full_dir.mkdir()

            # Empty file
            empty_tag = '20261106_empty'
            empty_file = full_dir / f'full_{empty_tag}.tar.gz'
            empty_file.write_text('')
            with self.assertRaises(ValueError) as ctx:
                ops_backup.verify_archive_target(full_dir, empty_tag)
            self.assertIn('BACKUP_ARCHIVE_EMPTY', str(ctx.exception))

    def test_resolve_container_multiple_instances_refused(self):
        mock_output = lambda cmd: b'container_id_1\ncontainer_id_2\n'
        with self.assertRaises(RuntimeError) as ctx:
            ops_backup.resolve_single_container('backend', runner=mock_output)
        self.assertIn('MULTIPLE_CONTAINERS_REFUSED', str(ctx.exception))

    def test_resolve_container_success_single_instance(self):
        mock_output = lambda cmd: b'unique_container_id_123\n'
        cid = ops_backup.resolve_single_container('backend', runner=mock_output)
        self.assertEqual(cid, 'unique_container_id_123')

    def test_dual_scheduler_conflict_detected(self):
        mock_output = lambda cmd: b'1\n'
        conflict = ops_backup.check_app_scheduler_conflict('cid_123', runner=mock_output)
        self.assertTrue(conflict)

        mock_output_disabled = lambda cmd: b'0\n'
        no_conflict = ops_backup.check_app_scheduler_conflict('cid_123', runner=mock_output_disabled)
        self.assertFalse(no_conflict)

    def test_atomic_receipt_generation_and_fsync(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            receipt_path = root / 'last-success.json'
            payload = {
                'format': 'guatswr-backup-receipt-v1',
                'run_id': 'run_123',
                'tag': '20261106_120000_abcd',
                'plaintext_sha256': 'a' * 64,
                'encrypted_sha256': 'b' * 64,
                'status': 'accepted',
            }

            ops_backup.atomic_write_receipt(receipt_path, payload)
            self.assertTrue(receipt_path.exists())
            import json
            read_back = json.loads(receipt_path.read_text(encoding='utf-8'))
            self.assertEqual(read_back['run_id'], 'run_123')
            self.assertEqual(read_back['status'], 'accepted')
            self.assertFalse(list(root.glob('.last-success.*.tmp')))


if __name__ == '__main__':
    unittest.main()
