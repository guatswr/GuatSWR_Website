"""Create synthetic legacy shape: retained main audit table, member bio and NULL tags."""
import contextlib
import json
from pathlib import Path
import sqlite3


def create_fixture(output):
    output = Path(output)
    output.mkdir(mode=0o700, parents=False, exist_ok=False)
    schema = json.loads((Path(__file__).parent.parent / 'src/models/legacy-schema.json').read_text(encoding='utf-8'))
    for kind, filename in [('main', 'guatswr_web_main.db'), ('audit', 'guatswr_web_logs.db')]:
        with contextlib.closing(sqlite3.connect(output / filename)) as db:
            for sql in schema[kind]:
                db.execute(sql)
            if kind == 'main':
                for table, definition in schema['columns']:
                    try:
                        db.execute(f'ALTER TABLE "{table}" ADD COLUMN {definition}')
                    except sqlite3.OperationalError as error:
                        if 'duplicate column name' not in str(error):
                            raise
                for sql in schema['indexes']:
                    db.execute(sql)
                db.execute('ALTER TABLE members ADD COLUMN bio TEXT')
                for sql in schema['audit']:
                    db.execute(sql)
                db.execute("INSERT INTO users(username,password,role) VALUES('synthetic-owner','not-a-real-password-hash','super_admin')")
                db.execute("INSERT INTO members(name,role,tags,bio) VALUES('synthetic-null','member',NULL,'synthetic retained biography')")
                db.execute("INSERT INTO members(name,role,tags,bio) VALUES('synthetic-tags','member','[\"synthetic\"]',NULL)")
                db.execute("INSERT INTO events(id,type,title,content,status) VALUES(1,'general','synthetic event','{\"future\":{\"retained\":true}}','draft')")
                db.execute("INSERT INTO event_participants(event_id,visitor_ip,common_id) VALUES(1,'203.0.113.1','synthetic-participant')")
                db.execute("INSERT INTO site_config VALUES('synthetic_extension','retained')")
            db.execute("INSERT INTO audit_logs(username,action,details) VALUES('synthetic','FIXTURE','synthetic details')")
            db.commit()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('output')
    create_fixture(parser.parse_args().output)
