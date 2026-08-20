PRAGMA foreign_keys = ON;

CREATE TABLE generation_requests (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_generation_requests_owner_created
  ON generation_requests(owner_user_id, created_at);
