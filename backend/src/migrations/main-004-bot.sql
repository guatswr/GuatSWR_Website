-- Additive Bot platform. Provision explicitly; application startup performs no DDL.
CREATE TABLE bot_credentials (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  secret_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL,
  groups_json TEXT NOT NULL,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);
CREATE TABLE bot_subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  credential_id TEXT NOT NULL REFERENCES bot_credentials(id),
  group_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id INTEGER NOT NULL DEFAULT 0,
  lead_minutes INTEGER NOT NULL DEFAULT 60,
  UNIQUE(credential_id, group_id, event_name, event_id)
);
CREATE TABLE bot_notifications (
  id TEXT PRIMARY KEY NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  event_name TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE bot_deliveries (
  id TEXT PRIMARY KEY NOT NULL,
  notification_id TEXT NOT NULL REFERENCES bot_notifications(id),
  credential_id TEXT REFERENCES bot_credentials(id),
  subscription_id TEXT,
  group_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed','skipped','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_until INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  last_error TEXT,
  delivered_at INTEGER,
  UNIQUE(notification_id, credential_id, group_id)
);
CREATE INDEX idx_bot_delivery_due ON bot_deliveries(status,next_attempt_at,lease_until);
CREATE TABLE bot_identities (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT UNIQUE,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  credential_id TEXT REFERENCES bot_credentials(id),
  qq TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(credential_id,qq)
);
CREATE TABLE bot_link_codes (
  code_hash TEXT PRIMARY KEY NOT NULL,
  identity_id TEXT NOT NULL REFERENCES bot_identities(id),
  expires_at INTEGER NOT NULL
);
ALTER TABLE event_participants ADD COLUMN bot_identity_id TEXT;
CREATE UNIQUE INDEX idx_participant_bot_identity ON event_participants(event_id,bot_identity_id);
CREATE INDEX idx_bot_link_expiry ON bot_link_codes(expires_at);
