ALTER TABLE audit_logs ADD COLUMN source_id TEXT;
CREATE UNIQUE INDEX idx_audit_source_id ON audit_logs(source_id);
