PRAGMA foreign_keys = ON;

CREATE TABLE instagram_connections (
  owner_user_id TEXT PRIMARY KEY,
  instagram_user_id TEXT NOT NULL,
  instagram_username TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  token_key_version INTEGER NOT NULL DEFAULT 1,
  token_expires_at INTEGER,
  granted_scopes TEXT NOT NULL,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE TABLE instagram_oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_instagram_oauth_states_expires_at
  ON instagram_oauth_states(expires_at);
