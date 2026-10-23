"""Verify frozen initialization SQL independently of application initialization."""
import hashlib
import json
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).parent.parent / 'src/migrations'
MANIFEST = json.loads((ROOT / 'manifest.json').read_text(encoding='utf-8'))


def shape(db, name):
    return {'columns': [list(row) for row in db.execute('SELECT * FROM pragma_table_xinfo(?)', (name,))],
            'foreignKeys': [list(row) for row in db.execute('SELECT * FROM pragma_foreign_key_list(?)', (name,))],
            'indexes': sorted([{'name': row[1], 'unique': row[2], 'origin': row[3], 'partial': row[4],
                               'columns': [list(item) for item in db.execute('SELECT * FROM pragma_index_xinfo(?)', (row[1],))]}
                              for row in db.execute('SELECT * FROM pragma_index_list(?)', (name,))], key=lambda item: item['name'])}


class BaselineTests(unittest.TestCase):
    def test_hashes_and_fresh_schema_match_reviewed_metadata(self):
        for kind, entry in MANIFEST.items():
            with self.subTest(database=kind):
                source = (ROOT / entry['file']).read_bytes()
                self.assertNotIn(b'\r', source)
                self.assertEqual(hashlib.sha256(source).hexdigest(), entry['sha256'])
                db = sqlite3.connect(':memory:')
                try:
                    db.execute('PRAGMA foreign_keys=ON')
                    db.executescript('BEGIN IMMEDIATE;\n' + source.decode() + '\nCOMMIT;')
                    for table, expected in entry['shape'].items():
                        expected = {**expected, 'indexes': sorted(expected['indexes'], key=lambda item: item['name'])}
                        self.assertEqual(shape(db, table), expected)
                    self.assertEqual(list(db.execute('PRAGMA integrity_check')), [('ok',)])
                    self.assertEqual(list(db.execute('PRAGMA foreign_key_check')), [])
                finally:
                    db.close()

    def test_baseline_is_not_an_implicit_adoption_or_repair(self):
        db = sqlite3.connect(':memory:')
        try:
            db.execute('CREATE TABLE users(id INTEGER PRIMARY KEY, retained TEXT)')
            db.execute("INSERT INTO users VALUES(1,'synthetic retained')")
            db.commit()
            with self.assertRaises(sqlite3.OperationalError):
                db.executescript('BEGIN IMMEDIATE;\n' + (ROOT / 'main-001.sql').read_text())
            db.rollback()
            self.assertEqual(list(db.execute('SELECT * FROM users')), [(1, 'synthetic retained')])
            self.assertEqual(list(db.execute("SELECT name FROM sqlite_master WHERE type='table'")), [('users',)])
        finally:
            db.close()


if __name__ == '__main__':
    unittest.main()
