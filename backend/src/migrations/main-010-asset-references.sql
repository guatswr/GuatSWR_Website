CREATE TABLE IF NOT EXISTS asset_references (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_field TEXT NOT NULL,
  source_version INTEGER NOT NULL DEFAULT 1,
  asset_path TEXT NOT NULL,
  family_key TEXT NOT NULL,
  incomplete INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_asset_references_unique
  ON asset_references(source_type, source_id, source_field, asset_path);

CREATE INDEX IF NOT EXISTS idx_asset_references_path
  ON asset_references(asset_path);

CREATE INDEX IF NOT EXISTS idx_asset_references_family
  ON asset_references(family_key);

CREATE INDEX IF NOT EXISTS idx_asset_references_source
  ON asset_references(source_type, source_id, source_field);
