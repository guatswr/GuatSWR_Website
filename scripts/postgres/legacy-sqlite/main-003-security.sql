ALTER TABLE users ADD COLUMN auth_version INTEGER NOT NULL DEFAULT 0
  CHECK(auth_version >= 0 AND auth_version <= 9007199254740991);
CREATE TABLE security_audit_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_at TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
CREATE INDEX idx_security_audit_pending ON security_audit_outbox(delivered_at, attempts, created_at, id);
