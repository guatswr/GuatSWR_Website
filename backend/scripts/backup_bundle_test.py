"""Adversarial archive checks. Synthetic data only; no application imports."""
import importlib.util
import contextlib
import io
import json
from pathlib import Path
import sqlite3
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('bundle', Path(__file__).with_name('backup_bundle.py'))
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


class RestoreChecks(unittest.TestCase):
    def test_public_backup_excludes_derived_publication_temporaries_even_when_hardlinked(self):
        source = self.root / 'publication-public'
        source.mkdir()
        temporary = source / '.asset-prepare-synthetic.tmp'
        temporary.write_bytes(b'verified derived copy')
        import os
        os.link(temporary, source / 'published.png')
        archive = bundle.pack_public(source, self.root / 'publication-output', '20300101_000000')
        self.assertEqual(set(bundle.scan(archive)), {'published.png'})

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='guatswr-archive-test-')
        self.root = Path(self.temp.name).resolve()
        self.target = self.root / 'new-target'

    def tearDown(self):
        self.assertEqual(self.root.parent, Path(tempfile.gettempdir()).resolve())
        self.assertTrue(self.root.name.startswith('guatswr-archive-test-'))
        self.temp.cleanup()

    def archive(self, name, entries):
        output = self.root / name
        with tarfile.open(output, 'w:gz') as archive:
            for entry, data in entries:
                archive.addfile(entry, io.BytesIO(data) if entry.isfile() or entry.type == tarfile.XHDTYPE else None)
        self.sign(output)
        return output

    def sign(self, filename):
        Path(str(filename).removesuffix('.tar.gz') + '.sha256').write_text(bundle.digest(filename) + '  ' + filename.name + '\n')

    def file(self, name, data=b'data'):
        entry = tarfile.TarInfo(name)
        entry.size = len(data)
        return entry, data

    def refused(self, archive, **options):
        with self.assertRaises(Exception):
            bundle.restore(archive, self.target, options.get('checksum'), options.get('legacy', False))
        self.assertFalse(self.target.exists())
        self.assertFalse(any(self.root.glob('.guatswr-restore-*')))

    def make_full(self, legacy=False, corrupt=False, orphan=False, quarantine=False):
        source = self.root / 'source'
        source.mkdir()
        private = self.root / 'private-source'
        job_id = '01234567-1234-1234-1234-0123456789ab'
        if quarantine:
            private.mkdir(mode=0o700)
            (private / job_id).write_bytes(b'synthetic quarantine bytes')
        for name in ['main.db', 'logs.db']:
            with contextlib.closing(sqlite3.connect(source / name)) as connection:
                connection.execute('CREATE TABLE fixture (value TEXT)')
                connection.execute("INSERT INTO fixture VALUES ('synthetic')")
                if name == 'main.db':
                    connection.execute('CREATE TABLE users (id INTEGER PRIMARY KEY)')
                    connection.execute('CREATE TABLE site_config (key TEXT PRIMARY KEY, value TEXT)')
                    if quarantine:
                        connection.execute('CREATE TABLE asset_cleanup_jobs (id TEXT PRIMARY KEY, identity TEXT, state TEXT)')
                        connection.execute('INSERT INTO asset_cleanup_jobs VALUES (?,?,?)', (job_id, bundle.verification_identity(private / job_id), 'pending'))
                    if orphan:
                        connection.execute('CREATE TABLE parents (id INTEGER PRIMARY KEY)')
                        connection.execute('CREATE TABLE children (parent INTEGER REFERENCES parents(id))')
                        connection.execute('INSERT INTO children VALUES (999)')
                else:
                    connection.execute('CREATE TABLE audit_logs (id INTEGER PRIMARY KEY)')
                connection.commit()
        if corrupt:
            (source / 'logs.db').write_bytes(b'corrupt sqlite')
        db = self.root / 'db_20261023_000001.tar.gz'
        with tarfile.open(db, 'w:gz') as archive:
            for name in ['main.db', 'logs.db']:
                archive.add(source / name, arcname=name)
        self.sign(db)
        public = source / 'public'
        public.mkdir()
        (public / 'fixture.txt').write_text('synthetic public bytes')
        uploads = bundle.pack_public(public, self.root / 'uploads', '20261023_000001')
        if legacy:
            full = self.root / 'legacy.tar.gz'
            with tarfile.open(full, 'w:gz') as archive:
                archive.add(db, arcname=db.name)
                archive.add(uploads, arcname=uploads.name)
            self.sign(full)
            return full
        return bundle.pack_full(db, uploads, uploads.with_name('uploads_20261023_000001.manifest.json'), self.root / 'full', '20261023_000001', 'online-per-resource', 'synthetic', private if quarantine else None)

    def test_v3_restores_private_bytes_and_rebinds_only_verified_quarantine_identity(self):
        archive = self.make_full(quarantine=True)
        bundle.restore(archive, self.target, None, False)
        receipt = json.loads((self.target / 'RESTORE_READY.json').read_bytes())
        self.assertEqual(receipt['manifest']['version'], 3)
        self.assertEqual(receipt['rebound_cleanup_jobs'], 1)
        job_id = '01234567-1234-1234-1234-0123456789ab'
        private = self.target / 'data/asset-quarantine' / job_id
        self.assertEqual(private.read_bytes(), b'synthetic quarantine bytes')
        self.assertFalse((self.target / 'data/public' / job_id).exists())
        with contextlib.closing(sqlite3.connect(self.target / 'data/guatswr_web_main.db')) as connection:
            self.assertEqual(connection.execute('SELECT identity,state FROM asset_cleanup_jobs').fetchone(), (bundle.verification_identity(private), 'pending'))

    def test_v3_rejects_tampered_quarantine_binding_before_publication(self):
        archive = self.make_full(quarantine=True)
        with tarfile.open(archive, 'r:gz') as source:
            contents = {item.name: source.extractfile(item).read() for item in source if item.isfile()}
        manifest = json.loads(contents[bundle.MANIFEST])
        next(iter(manifest['quarantine']['bindings'].values()))['sha256'] = '0' * 64
        contents[bundle.MANIFEST] = json.dumps(manifest).encode()
        self.refused(self.archive('tampered-binding.tar.gz', [self.file(name, data) for name, data in contents.items()]))

    def test_rejects_reused_nested_archive_names(self):
        archive = self.make_full()
        with tarfile.open(archive, 'r:gz') as source:
            contents = {item.name: source.extractfile(item).read() for item in source if item.isfile()}
        manifest = json.loads(contents[bundle.MANIFEST])
        contents.pop(manifest['public']['archive'])
        manifest['public'] = manifest['databases']
        contents[bundle.MANIFEST] = json.dumps(manifest).encode()
        self.refused(self.archive('alias-parts.tar.gz', [self.file(name, data) for name, data in contents.items()]))

    def test_verify_publishes_a_bound_marker_only_after_complete_restore(self):
        archive = self.make_full(quarantine=True)
        output = bundle.verify_backup(archive, self.root)
        marker = json.loads(output.read_bytes())
        self.assertEqual(marker['source_sha256'], bundle.digest(archive))
        self.assertEqual(marker['source_identity'], bundle.verification_identity(archive))
        self.assertEqual(marker['artifact'], archive.name)
        self.assertEqual(marker['format'], 'guatswr-verified-backup')
        self.assertFalse((archive.parent / '.backup-retention.lock').exists())
        self.assertFalse(any(self.root.glob('.guatswr-verify-*')))
        lock = archive.parent / '.backup-retention.lock'
        lock.mkdir()
        with self.assertRaises(FileExistsError):
            bundle.verify_backup(archive, self.root)
        self.assertTrue(lock.exists())

    def test_corrupt_database_never_receives_a_verified_marker(self):
        archive = self.make_full(corrupt=True)
        with self.assertRaises(Exception):
            bundle.verify_backup(archive, self.root)
        self.assertFalse(archive.with_name(archive.name + '.verified.json').exists())
        self.assertFalse((archive.parent / '.backup-retention.lock').exists())

    def test_valid_manifest_and_resources(self):
        archive = self.make_full()
        bundle.restore(archive, self.target, None, False)
        self.assertEqual((self.target / 'data/public/fixture.txt').read_text(), 'synthetic public bytes')
        receipt = json.loads((self.target / 'RESTORE_READY.json').read_bytes())
        self.assertEqual(receipt['manifest']['consistency'], 'online-per-resource')
        with contextlib.closing(sqlite3.connect(self.target / 'data/guatswr_web_logs.db')) as connection:
            self.assertEqual(connection.execute('SELECT value FROM fixture').fetchone(), ('synthetic',))

    def test_traversal_and_absolute_paths(self):
        for index, name in enumerate(['../escape', '/tmp/escape', 'C:/escape', 'a\\escape', 'a/../escape', 'a//escape']):
            with self.subTest(name=name):
                self.refused(self.archive(f'unsafe-{index}.tar.gz', [self.file(name)]))

    def test_symlinks_hardlinks_and_special_nodes(self):
        for index, kind in enumerate([tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.BLKTYPE, tarfile.FIFOTYPE]):
            with self.subTest(kind=kind):
                entry = tarfile.TarInfo('link')
                entry.type = kind
                entry.linkname = '../escape'
                self.refused(self.archive(f'link-{index}.tar.gz', [(entry, b'')]))

    def test_duplicates_and_parent_conflicts(self):
        self.refused(self.archive('duplicate.tar.gz', [self.file('same'), self.file('same')]))
        self.refused(self.archive('parent.tar.gz', [self.file('parent'), self.file('parent/child')]))

    def test_wrong_or_missing_outer_checksum(self):
        archive = self.make_full()
        self.refused(archive, checksum='0' * 64)
        archive.with_name(archive.name.removesuffix('.tar.gz') + '.sha256').unlink()
        self.refused(archive)

    def test_legacy_requires_explicit_opt_in(self):
        archive = self.make_full(legacy=True)
        self.refused(archive)
        bundle.restore(archive, self.target, None, True)
        receipt = json.loads((self.target / 'RESTORE_READY.json').read_bytes())
        self.assertEqual(receipt['manifest']['consistency'], 'legacy-unknown')

    def test_corrupt_database_cannot_publish_target(self):
        self.refused(self.make_full(corrupt=True))

    def test_foreign_key_violations_cannot_publish_target(self):
        self.refused(self.make_full(orphan=True))

    def test_missing_audit_even_with_updated_checksums(self):
        full = self.make_full()
        with tarfile.open(full, 'r:gz') as archive:
            parts = {entry.name: archive.extractfile(entry).read() for entry in archive}
        manifest = json.loads(parts[bundle.MANIFEST])
        db_name = manifest['databases']['archive']
        with tarfile.open(fileobj=io.BytesIO(parts[db_name]), mode='r:gz') as archive:
            main = archive.extractfile('main.db').read()
        nested = self.archive('missing-audit.tar.gz', [self.file('main.db', main)])
        parts[db_name] = nested.read_bytes()
        manifest['databases'].update(bundle.info(nested))
        manifest['databases']['files'] = bundle.scan(nested)
        parts[bundle.MANIFEST] = bundle.json_bytes(manifest)
        attack = self.archive('missing-audit-full.tar.gz', [self.file(name, value) for name, value in parts.items()])
        self.refused(attack)

    def test_malformed_manifest_is_not_legacy_fallback(self):
        full = self.make_full()
        with tarfile.open(full, 'r:gz') as archive:
            parts = {entry.name: archive.extractfile(entry).read() for entry in archive}
        parts[bundle.MANIFEST] = b'{invalid'
        attack = self.archive('bad-manifest.tar.gz', [self.file(name, value) for name, value in parts.items()])
        self.refused(attack, legacy=True)

    def test_existing_target_is_preserved(self):
        archive = self.make_full()
        self.target.mkdir()
        sentinel = self.target / 'keep'
        sentinel.write_text('keep')
        with self.assertRaisesRegex(ValueError, 'must not exist'):
            bundle.restore(archive, self.target, None, False)
        self.assertEqual(sentinel.read_text(), 'keep')

    def test_nested_checksum_mismatch(self):
        archive = self.make_full()
        entries = []
        with tarfile.open(archive, 'r:gz') as source:
            for entry in source:
                data = source.extractfile(entry).read()
                if entry.name.startswith('uploads_'):
                    data = data[:-1] + bytes([data[-1] ^ 1])
                entries.append(self.file(entry.name, data))
        self.refused(self.archive('tampered.tar.gz', entries))

    def test_oversized_pax_metadata(self):
        entry = tarfile.TarInfo('pax')
        entry.type = tarfile.XHDTYPE
        entry.size = 1024**2 + 1
        self.refused(self.archive('pax.tar.gz', [(entry, b'x' * entry.size)]))

    def test_archive_resource_budgets_fail_closed(self):
        archive = self.archive('many.tar.gz', [self.file('a'), self.file('b'), self.file('c')])
        old = bundle.MAX_FILES
        try:
            bundle.MAX_FILES = 2
            self.refused(archive)
        finally:
            bundle.MAX_FILES = old
        old = bundle.MAX_BYTES
        try:
            bundle.MAX_BYTES = 1024
            self.refused(archive)
        finally:
            bundle.MAX_BYTES = old


if __name__ == '__main__':
    unittest.main()
