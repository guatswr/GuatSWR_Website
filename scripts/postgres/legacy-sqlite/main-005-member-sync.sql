-- Explicit additive migration; never executed by application startup.
ALTER TABLE members ADD COLUMN qq TEXT;
ALTER TABLE members ADD COLUMN profile_status TEXT NOT NULL DEFAULT 'complete';
ALTER TABLE members ADD COLUMN sync_managed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN sync_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN sync_protected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN follow_group_name INTEGER NOT NULL DEFAULT 0;
ALTER TABLE members ADD COLUMN follow_group_avatar INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX idx_members_qq ON members(qq) WHERE qq IS NOT NULL;
CREATE TABLE member_sync_meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL DEFAULT 0);
INSERT INTO member_sync_meta(id) VALUES(1);
CREATE TRIGGER members_revision_insert AFTER INSERT ON members BEGIN UPDATE member_sync_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER members_revision_update AFTER UPDATE ON members BEGIN UPDATE member_sync_meta SET revision=revision+1 WHERE id=1; END;
CREATE TRIGGER members_revision_delete AFTER DELETE ON members BEGIN UPDATE member_sync_meta SET revision=revision+1 WHERE id=1; END;
CREATE TABLE member_sync_settings (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, value TEXT NOT NULL);
INSERT INTO member_sync_settings VALUES(1,1,'{"enabled":false,"credential_id":null,"groups":[],"interval_minutes":360,"admin_user_ids":[]}');
CREATE TABLE member_sync_groups (
  group_id TEXT PRIMARY KEY NOT NULL, generation INTEGER NOT NULL DEFAULT 0,
  last_applied_generation INTEGER NOT NULL DEFAULT 0, initialized INTEGER NOT NULL DEFAULT 0,
  next_due_at INTEGER NOT NULL DEFAULT 0, last_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE member_sync_requests (
  id TEXT PRIMARY KEY NOT NULL, group_id TEXT NOT NULL REFERENCES member_sync_groups(group_id),
  credential_id TEXT NOT NULL REFERENCES bot_credentials(id), config_revision INTEGER NOT NULL,
  generation INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','collecting','preview','blocked','applying','succeeded','failed','expired')),
  created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
  batch_count INTEGER, member_count INTEGER, summary TEXT, error_code TEXT,
  UNIQUE(group_id,generation)
);
CREATE UNIQUE INDEX idx_member_sync_active ON member_sync_requests(group_id) WHERE status IN ('queued','collecting','preview','blocked','applying');
CREATE TABLE member_sync_batches (
  request_id TEXT NOT NULL REFERENCES member_sync_requests(id), batch_no INTEGER NOT NULL,
  checksum TEXT NOT NULL, members_json TEXT NOT NULL, member_count INTEGER NOT NULL, PRIMARY KEY(request_id,batch_no)
);
CREATE TABLE member_sync_avatars (
  id TEXT PRIMARY KEY NOT NULL, request_id TEXT NOT NULL REFERENCES member_sync_requests(id),
  qq TEXT NOT NULL, url TEXT NOT NULL, checksum TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(request_id,qq)
);
CREATE TABLE member_group_memberships (
  qq TEXT NOT NULL, group_id TEXT NOT NULL REFERENCES member_sync_groups(group_id),
  group_card TEXT NOT NULL, nickname TEXT NOT NULL, group_role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, misses INTEGER NOT NULL DEFAULT 0,
  last_seen_generation INTEGER NOT NULL, avatar_checksum TEXT, PRIMARY KEY(qq,group_id)
);
CREATE TABLE member_profile_tasks (
  member_id INTEGER PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL, completed_at INTEGER, notified_at INTEGER,
  notification_id TEXT REFERENCES bot_notifications(id)
);
ALTER TABLE bot_deliveries ADD COLUMN target_type TEXT NOT NULL DEFAULT 'group';
ALTER TABLE bot_deliveries ADD COLUMN target_id TEXT;
ALTER TABLE bot_deliveries ADD COLUMN recipient_user_id INTEGER;
ALTER TABLE bot_deliveries ADD COLUMN message_status TEXT;
ALTER TABLE bot_deliveries ADD COLUMN receipt_error TEXT;
