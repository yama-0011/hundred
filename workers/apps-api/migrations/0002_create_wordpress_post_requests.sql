CREATE TABLE wordpress_post_requests (
  owner_user_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  wordpress_site_id TEXT NOT NULL,
  wordpress_post_id TEXT,
  wordpress_post_url TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (owner_user_id, request_key),
  FOREIGN KEY (owner_user_id)
    REFERENCES users(owner_user_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_wordpress_post_requests_created_at
  ON wordpress_post_requests(created_at);
