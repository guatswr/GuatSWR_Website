import contextlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from inspect_data import inspect_data, readonly
from create_observed_fixture import create_fixture


class InspectionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='guatswr-inspect-')
        self.root = Path(self.temporary.name).resolve()
        self.source = self.root / 'source'
        self.source.mkdir()
        self.main = sqlite3.connect(self.source / 'guatswr_web_main.db')
        self.audit = sqlite3.connect(self.source / 'guatswr_web_logs.db')
        for db in [self.main, self.audit]:
            db.execute('PRAGMA journal_mode=WAL')
            db.execute('PRAGMA wal_autocheckpoint=0')
        self.main.executescript("""
            CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,password TEXT,role TEXT,private_custom_column TEXT DEFAULT 'private-default');
            CREATE TABLE events(id INTEGER PRIMARY KEY,content TEXT,status TEXT,created_at TEXT);
            CREATE TABLE event_participants(id INTEGER PRIMARY KEY,event_id INTEGER,user_id INTEGER,visitor_ip TEXT,
              FOREIGN KEY(event_id) REFERENCES events(id));
            CREATE TABLE history(id INTEGER PRIMARY KEY,date TEXT,title TEXT);
            CREATE TABLE members(id INTEGER PRIMARY KEY,name TEXT,role TEXT,tags TEXT);
            CREATE TABLE private_extension(private_value TEXT);
            INSERT INTO users VALUES(1,'private-name','private-hash','admin','private-column-value');
            INSERT INTO private_extension VALUES('private-extension-row');
        """)
        self.audit.execute('CREATE TABLE audit_logs(id INTEGER PRIMARY KEY,action TEXT,details TEXT,created_at TEXT)')
        self.audit.execute("INSERT INTO audit_logs VALUES(1,'TEST','private-audit-detail','2026-01-01 00:00:00')")
        self.audit.commit()

    def tearDown(self):
        self.main.close()
        self.audit.close()
        self.temporary.cleanup()

    def inspect(self):
        return inspect_data(self.source, self.root / 'snapshot')

    def test_live_wal_is_included_and_private_records_never_enter_summary(self):
        self.main.execute("INSERT INTO users VALUES(2,'wal-only','private-password','admin',NULL)")
        self.main.commit()
        report = self.inspect()
        self.assertEqual(report['databases']['main']['tables']['users']['rows'], 2)
        self.assertEqual(report['databases']['audit']['tables']['audit_logs']['rows'], 1)
        self.assertEqual(report['databases']['main']['extensionTables'], 1)
        encoded = json.dumps(report)
        for secret in ['private-name', 'private-hash', 'private-default', 'private-column-value', 'private-extension-row', 'private-audit-detail', 'private_extension', 'private_custom_column', 'wal-only']:
            self.assertNotIn(secret, encoded)
        with contextlib.closing(readonly(self.root / 'snapshot/guatswr_web_main.db')) as copied:
            self.assertEqual(copied.execute('SELECT private_custom_column FROM users WHERE id=1').fetchone()[0], 'private-column-value')
        self.assertFalse((self.root / 'snapshot/RESTORE_READY.json').exists())

    def test_bad_json_dates_duplicates_nulls_and_orphans_are_counted_without_repair(self):
        self.main.executescript("""
            INSERT INTO users VALUES(2,'private-name',NULL,'admin',NULL);
            INSERT INTO members VALUES(1,'member','role','{bad json');
            INSERT INTO history VALUES(1,'not-a-date','history');
            INSERT INTO events VALUES(1,'{bad','draft','2026-01-01 00:00:00');
            INSERT INTO event_participants VALUES(1,999,8,'203.0.113.1');
            INSERT INTO event_participants VALUES(2,999,8,'203.0.113.1');
        """)
        report = self.inspect()['databases']['main']
        self.assertEqual(report['tables']['users']['duplicateUsernames'], 1)
        self.assertEqual(report['tables']['users']['emptyRequired']['password'], 1)
        self.assertEqual(report['tables']['members']['invalidJson']['tags'], 1)
        self.assertEqual(report['tables']['members']['jsonKinds']['tags'], {'invalid': 1})
        self.assertEqual(report['tables']['history']['unparseableDates']['date'], 1)
        self.assertEqual(report['tables']['event_participants']['orphanEvents'], 2)
        self.assertEqual(report['tables']['event_participants']['duplicate_user_id_groups'], 1)
        self.assertEqual(report['foreignKeyViolations'], 2)
        self.assertEqual(self.main.execute('SELECT count(*) FROM event_participants').fetchone()[0], 2)

    def test_readonly_connection_rejects_write(self):
        with contextlib.closing(readonly(self.source / 'guatswr_web_main.db')) as db:
            with self.assertRaises(sqlite3.OperationalError):
                db.execute('DELETE FROM users')
        self.assertEqual(self.main.execute('SELECT count(*) FROM users').fetchone()[0], 1)

    def test_source_and_snapshot_schema_and_nulls_remain_unchanged(self):
        before = list(self.main.execute('SELECT type,name,sql FROM sqlite_master ORDER BY type,name'))
        report = self.inspect()
        self.assertTrue(report['databases']['main']['integrityOk'])
        self.assertEqual(report['databases']['main']['foreignKeyViolations'], 0)
        self.assertEqual(before, list(self.main.execute('SELECT type,name,sql FROM sqlite_master ORDER BY type,name')))
        self.assertEqual(report['consistency'], 'online-per-resource')
        self.assertFalse(report['applicationInitialized'])

    def test_existing_output_and_source_overlap_are_rejected(self):
        with self.assertRaises(ValueError):
            inspect_data(self.source, self.source / 'copy')
        self.inspect()
        with self.assertRaises(FileExistsError):
            self.inspect()

    def test_missing_audit_rejects_before_creating_output(self):
        with self.assertRaises(ValueError):
            inspect_data(self.source, self.root / 'snapshot', audit_file='absent.db')
        self.assertFalse((self.root / 'snapshot').exists())

    def test_relative_or_traversing_names_are_rejected(self):
        with self.assertRaises(ValueError):
            inspect_data(Path('relative'), self.root / 'snapshot')
        for filename in ['../main.db', 'nested/main.db', 'C:main.db', 'main\ndb']:
            with self.assertRaises(ValueError):
                inspect_data(self.source, self.root / 'snapshot', main_file=filename)

    def test_schema_fingerprint_is_repeatable_across_snapshots(self):
        first = self.inspect()
        second = inspect_data(self.source, self.root / 'second')
        for kind in ['main', 'audit']:
            self.assertEqual(first['databases'][kind]['schemaHash'], second['databases'][kind]['schemaHash'])

    def test_observed_shape_fixture_is_synthetic_and_preserves_extensions(self):
        source = self.root / 'synthetic-observed'
        create_fixture(source)
        report = inspect_data(source, self.root / 'synthetic-snapshot')
        main = report['databases']['main']
        self.assertEqual(main['missingTables'], [])
        self.assertEqual(main['extensionTables'], 1)
        self.assertEqual(main['tables']['members']['jsonKinds']['tags'], {'array': 1, 'sql_null': 1})
        self.assertEqual(main['foreignKeyViolations'], 0)
        with contextlib.closing(readonly(source / 'guatswr_web_main.db')) as db:
            self.assertEqual(db.execute('SELECT bio FROM members WHERE id=1').fetchone()[0], 'synthetic retained biography')
            self.assertEqual(db.execute('SELECT count(*) FROM audit_logs').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
