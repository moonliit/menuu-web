ALTER TABLE users ADD COLUMN banned_at TEXT;
ALTER TABLE users ADD COLUMN banned_by TEXT REFERENCES users(id);

CREATE TABLE admin_user_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('ban', 'restore')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX admin_user_events_user_idx ON admin_user_events(user_id,created_at DESC);
