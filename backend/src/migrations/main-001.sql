-- Frozen v1 baseline; initialization only, never apply over a legacy database.
CREATE TABLE activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      tag TEXT,
      date TEXT,
      description TEXT,
      content TEXT,
      cover_image TEXT,
      images TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_by INTEGER,
      updated_by INTEGER,
      status TEXT DEFAULT 'published',
      deleted_at DATETIME,
      deleted_by INTEGER
    );

CREATE TABLE banned_ips (
      ip TEXT PRIMARY KEY,
      reason TEXT,
      created_at INTEGER,
      expires_at INTEGER,
      created_by TEXT
    );

CREATE TABLE event_participants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_id INTEGER,
    visitor_ip TEXT,
    common_id TEXT,
    machine_sign TEXT,
    pilot_source TEXT,
    qq TEXT,
    avatar TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id),
    UNIQUE(event_id, visitor_ip),
    FOREIGN KEY(event_id) REFERENCES events(id) ON DELETE CASCADE
  );

CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'general',
    title TEXT,
    content TEXT DEFAULT '{}',
    status TEXT DEFAULT 'draft',
    created_by INTEGER,
    visitor_ip TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

CREATE TABLE history (id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, title TEXT, description TEXT, image TEXT, sort_order INTEGER DEFAULT 0, deleted_at DATETIME, deleted_by INTEGER);

CREATE TABLE login_attempts (
      ip TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      lock_until INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

CREATE TABLE members (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, role TEXT, avatar TEXT, school TEXT, tags TEXT, sort_order INTEGER DEFAULT 0, deleted_at DATETIME, deleted_by INTEGER);

CREATE TABLE site_config (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      password TEXT,
      role TEXT DEFAULT 'admin',
      avatar TEXT,
      twofa_secret TEXT,
      twofa_enabled INTEGER DEFAULT 0
    );

CREATE INDEX idx_activities_created_at ON activities(created_at);

CREATE INDEX idx_activities_date ON activities(date);

CREATE INDEX idx_activities_deleted_at ON activities(deleted_at);

CREATE INDEX idx_banned_ips_expires ON banned_ips(expires_at);

CREATE INDEX idx_event_participants_event ON event_participants(event_id);

CREATE INDEX idx_event_participants_ip ON event_participants(visitor_ip);

CREATE INDEX idx_event_participants_user ON event_participants(user_id);

CREATE INDEX idx_history_date ON history(date);

CREATE INDEX idx_history_deleted_at ON history(deleted_at);

CREATE INDEX idx_history_sort ON history(sort_order);

CREATE INDEX idx_members_deleted_at ON members(deleted_at);

CREATE INDEX idx_members_name ON members(name);
