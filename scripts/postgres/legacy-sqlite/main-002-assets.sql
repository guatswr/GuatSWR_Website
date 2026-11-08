CREATE TABLE asset_cleanup_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  url TEXT NOT NULL,
  identity TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','quarantined','retained','obsolete','missing')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_asset_cleanup_queue ON asset_cleanup_jobs(state, updated_at, id);
