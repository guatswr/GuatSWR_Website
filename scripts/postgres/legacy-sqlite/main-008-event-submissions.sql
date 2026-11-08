-- Submission receipts bind event_id, verified visitor capability and payload digest
-- in the same transaction as event status updates, guaranteeing crash-consistent idempotency.
CREATE TABLE event_submissions (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  capability_key TEXT NOT NULL,
  digest TEXT NOT NULL,
  response TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_event_submissions_capability ON event_submissions(capability_key);
