-- Content snapshots are private admin data. Existing rows receive a baseline,
-- captured now; this is not a reconstruction of edits made before migration.
CREATE TABLE activity_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('baseline','create','update','restore')),
  actor_id INTEGER,
  actor_name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  restored_from INTEGER,
  title TEXT, tag TEXT, date TEXT, description TEXT, content TEXT,
  cover_image TEXT, images TEXT, source_status TEXT,
  changed_fields TEXT NOT NULL DEFAULT '[]',
  UNIQUE(activity_id,version)
);
INSERT INTO activity_revisions(activity_id,version,action,actor_id,actor_name,created_at,title,tag,date,description,content,cover_image,images,source_status)
SELECT a.id,1,'baseline',COALESCE(a.updated_by,a.created_by),
  COALESCE((SELECT username FROM users WHERE id=COALESCE(a.updated_by,a.created_by)),'历史记录'),
  CAST(strftime('%s','now') AS INTEGER)*1000,a.title,a.tag,a.date,a.description,a.content,a.cover_image,a.images,a.status
FROM activities a;
