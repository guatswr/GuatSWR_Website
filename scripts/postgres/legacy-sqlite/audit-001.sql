-- Frozen v1 baseline; initialization only, never apply over a legacy database.
CREATE TABLE audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, action TEXT, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);

CREATE INDEX idx_logs_created_at ON audit_logs(created_at);

CREATE INDEX idx_logs_username ON audit_logs(username);
