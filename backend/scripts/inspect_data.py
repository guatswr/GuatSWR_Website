"""Read-only dual SQLite snapshots and aggregate diagnostics. Never initializes an app."""
import argparse
import contextlib
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time

MAIN_TABLES = {'users', 'activities', 'members', 'site_config', 'history', 'login_attempts', 'banned_ips', 'events', 'event_participants'}
AUDIT_TABLES = {'audit_logs'}
JSON_COLUMNS = {'activities': ['images'], 'members': ['tags'], 'events': ['content']}
DATE_COLUMNS = {'activities': ['date', 'created_at', 'deleted_at'], 'history': ['date', 'deleted_at'], 'members': ['deleted_at'],
                'events': ['created_at', 'updated_at'], 'event_participants': ['created_at', 'updated_at'], 'audit_logs': ['created_at']}
REQUIRED_VALUES = {'users': ['username', 'password', 'role'], 'activities': ['title', 'date'], 'members': ['name', 'role'],
                   'history': ['date', 'title'], 'events': ['type', 'status', 'content'], 'event_participants': ['event_id'], 'audit_logs': ['action']}
SAFE_COLUMNS = {'id', 'username', 'password', 'role', 'avatar', 'twofa_secret', 'twofa_enabled', 'title', 'tag', 'date',
                'description', 'content', 'cover_image', 'images', 'created_at', 'created_by', 'updated_by', 'status',
                'deleted_at', 'deleted_by', 'name', 'school', 'tags', 'sort_order', 'key', 'value', 'ip', 'count',
                'lock_until', 'updated_at', 'reason', 'expires_at', 'type', 'visitor_ip', 'event_id', 'user_id',
                'common_id', 'machine_sign', 'pilot_source', 'qq', 'action', 'details'}


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def readonly(filename):
    connection = sqlite3.connect(filename.as_uri() + '?mode=ro', uri=True, timeout=5)
    connection.execute('PRAGMA query_only=ON')
    connection.execute('PRAGMA trusted_schema=OFF')
    connection.execute('PRAGMA foreign_keys=ON')
    return connection


def snapshot(source, destination, timeout_seconds=15):
    deadline = time.monotonic() + timeout_seconds

    def progress(_status, _remaining, _total):
        if time.monotonic() > deadline:
            raise TimeoutError('Snapshot deadline exceeded')

    with contextlib.closing(readonly(source)) as original, contextlib.closing(sqlite3.connect(destination)) as target:
        original.backup(target, pages=128, progress=progress, sleep=0.01)


def scalar(db, sql):
    return db.execute(sql).fetchone()[0]


def inspect_snapshot(filename, known_tables):
    with contextlib.closing(readonly(filename)) as db:
        schema = [dict(zip(['type', 'name', 'table', 'sql'], row)) for row in db.execute(
            "SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")]
        tables = {}
        private_tables = {}
        known_present = set()
        for entry in schema:
            if entry['type'] != 'table':
                continue
            name = entry['name']
            known = name in known_tables
            if known:
                known_present.add(name)
            label = name if known else 'extension_' + digest(name)[:16]
            columns = [dict(zip(['cid', 'name', 'type', 'notnull', 'default', 'pk', 'hidden'], row))
                       for row in db.execute('SELECT * FROM pragma_table_xinfo(?)', (name,))]
            indexes = []
            for row in db.execute('SELECT * FROM pragma_index_list(?)', (name,)):
                indexes.append({'name': row[1], 'unique': row[2], 'origin': row[3], 'partial': row[4],
                                'columns': list(db.execute('SELECT * FROM pragma_index_xinfo(?)', (row[1],)))})
            foreign_keys = list(db.execute('SELECT * FROM pragma_foreign_key_list(?)', (name,)))
            private_tables[name] = {'columns': columns, 'indexes': indexes, 'foreignKeys': foreign_keys}
            table = {'schemaHash': digest(private_tables[name]), 'columnCount': len(columns),
                     'indexCount': len(indexes), 'foreignKeyCount': len(foreign_keys)}
            # Unknown extensions may be virtual tables requiring unavailable modules.
            try:
                table['rows'] = scalar(db, f'SELECT count(*) FROM {identifier(name)}')
            except sqlite3.DatabaseError as error:
                table['countError'] = getattr(error, 'sqlite_errorname', 'SQLITE_ERROR')
            if known:
                existing = {column['name'] for column in columns}
                table['nulls'] = {column['name'] if column['name'] in SAFE_COLUMNS else 'extension_' + digest(column['name'])[:16]: scalar(db, f'SELECT count(*) FROM {identifier(name)} WHERE {identifier(column["name"])} IS NULL') for column in columns}
                table['emptyRequired'] = {column: scalar(db, f'SELECT count(*) FROM {identifier(name)} WHERE {identifier(column)} IS NULL OR trim(CAST({identifier(column)} AS TEXT)) = \'\'')
                                          for column in REQUIRED_VALUES.get(name, []) if column in existing}
                table['invalidJson'] = {column: scalar(db, f'SELECT count(*) FROM {identifier(name)} WHERE {identifier(column)} IS NOT NULL AND trim(CAST({identifier(column)} AS TEXT)) != \'\' AND NOT json_valid({identifier(column)})')
                                       for column in JSON_COLUMNS.get(name, []) if column in existing}
                table['jsonKinds'] = {column: dict(db.execute(f"SELECT CASE WHEN {identifier(column)} IS NULL THEN 'sql_null' WHEN trim(CAST({identifier(column)} AS TEXT)) = '' THEN 'empty' WHEN json_valid({identifier(column)}) THEN json_type({identifier(column)}) ELSE 'invalid' END, count(*) FROM {identifier(name)} GROUP BY 1"))
                                      for column in JSON_COLUMNS.get(name, []) if column in existing}
                table['unparseableDates'] = {column: scalar(db, f'SELECT count(*) FROM {identifier(name)} WHERE {identifier(column)} IS NOT NULL AND trim(CAST({identifier(column)} AS TEXT)) != \'\' AND datetime({identifier(column)}) IS NULL')
                                           for column in DATE_COLUMNS.get(name, []) if column in existing}
                # Report cardinalities, never status/role values or identifiers.
                for column in ['role', 'status', 'type']:
                    if column in existing:
                        table[column + 'Distinct'] = scalar(db, f'SELECT count(DISTINCT {identifier(column)}) FROM {identifier(name)}')
                if name == 'users' and 'username' in existing:
                    table['duplicateUsernames'] = scalar(db, 'SELECT count(*) FROM (SELECT username FROM users WHERE username IS NOT NULL GROUP BY username HAVING count(*) > 1)')
                if name == 'event_participants' and 'events' in known_present | {e['name'] for e in schema if e['type'] == 'table'} and 'event_id' in existing:
                    table['orphanEvents'] = scalar(db, 'SELECT count(*) FROM event_participants p LEFT JOIN events e ON e.id=p.event_id WHERE e.id IS NULL')
                    for column in ['user_id', 'visitor_ip']:
                        if column in existing:
                            table['duplicate_' + column + '_groups'] = scalar(db, f'SELECT count(*) FROM (SELECT event_id,{identifier(column)} FROM event_participants WHERE {identifier(column)} IS NOT NULL GROUP BY event_id,{identifier(column)} HAVING count(*) > 1)')
            tables[label] = table
        report = {'sqliteVersion': sqlite3.sqlite_version, 'schemaHash': digest(schema), 'tables': tables,
                  'missingTables': sorted(known_tables - known_present), 'extensionTables': len(set(private_tables) - known_tables),
                  'integrityOk': list(db.execute('PRAGMA integrity_check')) == [('ok',)],
                  'foreignKeyViolations': sum(1 for _ in db.execute('PRAGMA foreign_key_check')),
                  'pragmas': {key: scalar(db, 'PRAGMA ' + key) for key in ['application_id', 'user_version', 'schema_version', 'page_size', 'journal_mode', 'auto_vacuum', 'foreign_keys', 'query_only', 'trusted_schema']}}
        return report, {'schema': schema, 'tables': private_tables}


def inspect_data(source_data, output, main_file='guatswr_web_main.db', audit_file='guatswr_web_logs.db'):
    source_data, output = Path(source_data), Path(output)
    if not source_data.is_absolute() or not output.is_absolute():
        raise ValueError('Source and output must be absolute')
    if os.path.lexists(output):
        raise FileExistsError('Snapshot output must be a new directory')
    source_data, output = source_data.resolve(), output.resolve()
    if output.is_relative_to(source_data) or source_data.is_relative_to(output):
        raise ValueError('Snapshot output must be separate from source data')
    if os.path.lexists(output):
        raise FileExistsError('Snapshot output must be a new directory')
    sources = {}
    for kind, name in [('main', main_file), ('audit', audit_file)]:
        if Path(name).name != name or name in {'.', '..'} or any(char in name for char in '\\/:\x00\r\n'):
            raise ValueError('Database filenames must be simple basenames')
        original = source_data / name
        if original.is_symlink() or not original.is_file():
            raise ValueError('Both source databases must be regular existing files')
        with original.open('rb') as stream:
            if stream.read(16) != b'SQLite format 3\x00':
                raise ValueError('Source database header is invalid')
        sources[kind] = original
    if os.path.samefile(sources['main'], sources['audit']):
        raise ValueError('Main and audit must be different files')
    output.mkdir(mode=0o700)
    summary = {'formatVersion': 1, 'consistency': 'online-per-resource', 'applicationInitialized': False, 'complete': False,
               'startedAtUtc': datetime.now(timezone.utc).isoformat(), 'databases': {}}
    private = {'sources': {kind: str(filename) for kind, filename in sources.items()}, 'databases': {}}
    # These are diagnostic snapshots, not complete backups with public resources.
    for kind, original in sources.items():
        destination = output / original.name
        snapshot(original, destination)
        report, raw = inspect_snapshot(destination, MAIN_TABLES if kind == 'main' else AUDIT_TABLES)
        summary['databases'][kind] = report
        private['databases'][kind] = raw
    summary['complete'] = True
    summary['finishedAtUtc'] = datetime.now(timezone.utc).isoformat()
    (output / 'REPORT.private.json').write_text(json.dumps(private, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    (output / 'SUMMARY.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-data', required=True)
    parser.add_argument('--output', required=True)
    parser.add_argument('--main-file', default='guatswr_web_main.db')
    parser.add_argument('--audit-file', default='guatswr_web_logs.db')
    args = parser.parse_args()
    try:
        report = inspect_data(args.source_data, args.output, args.main_file, args.audit_file)
        print(json.dumps({'complete': report['complete'], 'summary': str(Path(args.output) / 'SUMMARY.json'),
                          'consistency': report['consistency']}))
    except Exception as error:
        print(json.dumps({'complete': False, 'errorClass': type(error).__name__, 'sqliteCode': getattr(error, 'sqlite_errorname', None)}))
        raise SystemExit(1)
