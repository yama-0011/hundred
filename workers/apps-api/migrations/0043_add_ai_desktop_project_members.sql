CREATE TABLE hundred_user_directory (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  last_seen_at INTEGER NOT NULL
);

CREATE INDEX idx_hundred_user_directory_username
  ON hundred_user_directory(username COLLATE NOCASE);

CREATE TABLE ai_desktop_project_members (
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  added_by TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id)
    REFERENCES ai_desktop_projects(project_id)
    ON DELETE CASCADE
);

CREATE INDEX idx_ai_desktop_project_members_user
  ON ai_desktop_project_members(user_id, project_id);
