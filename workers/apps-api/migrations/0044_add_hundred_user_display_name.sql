ALTER TABLE hundred_user_directory
  ADD COLUMN display_name TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_hundred_user_directory_display_name
  ON hundred_user_directory(display_name COLLATE NOCASE);
