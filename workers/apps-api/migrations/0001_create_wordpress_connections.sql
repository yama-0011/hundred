PRAGMA foreign_keys = ON;

CREATE TABLE users (
  owner_user_id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE wordpress_connections (
  owner_user_id TEXT PRIMARY KEY,
  wordpress_user_id TEXT,
  wordpress_username TEXT,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  token_key_version INTEGER NOT NULL DEFAULT 1,
  selected_site_id TEXT,
  selected_site_url TEXT,
  selected_site_name TEXT,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE TABLE oauth_states (
  state_hash TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  return_to TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_oauth_states_expires_at
  ON oauth_states(expires_at);
