PRAGMA foreign_keys = ON;

CREATE TABLE wordpress_application_password_connections (
  owner_user_id TEXT PRIMARY KEY,
  site_url TEXT NOT NULL,
  wordpress_user_id TEXT,
  wordpress_username TEXT NOT NULL,
  wordpress_display_name TEXT,
  application_password_ciphertext TEXT NOT NULL,
  application_password_iv TEXT NOT NULL,
  credential_key_version INTEGER NOT NULL DEFAULT 1,
  connected_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);
