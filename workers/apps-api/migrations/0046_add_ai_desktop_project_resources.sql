ALTER TABLE ai_desktop_projects
  ADD COLUMN file_structure TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_desktop_projects
  ADD COLUMN commands_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE ai_desktop_projects
  ADD COLUMN links_json TEXT NOT NULL DEFAULT '[]';
