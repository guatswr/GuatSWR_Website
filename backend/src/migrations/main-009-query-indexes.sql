-- Query indexes for events and members list queries.
CREATE INDEX idx_events_status_created ON events(status, created_at DESC);
CREATE INDEX idx_events_type_status_created ON events(type, status, created_at DESC);
CREATE INDEX idx_members_active_sort ON members(deleted_at, sort_order, id);
