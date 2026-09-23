CREATE TABLE ai_desktop_state (
  state_key TEXT PRIMARY KEY CHECK (state_key = 'shared'),
  state_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
