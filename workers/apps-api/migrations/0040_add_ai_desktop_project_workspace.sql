ALTER TABLE ai_desktop_projects
ADD COLUMN development_mode TEXT NOT NULL DEFAULT 'personal'
CHECK (development_mode IN ('personal', 'team'));

ALTER TABLE ai_desktop_projects
ADD COLUMN system_diagram_source TEXT NOT NULL DEFAULT '';

ALTER TABLE ai_desktop_projects
ADD COLUMN technology_stack_json TEXT NOT NULL DEFAULT '[]';

ALTER TABLE ai_desktop_projects
ADD COLUMN database_info_json TEXT NOT NULL DEFAULT '[]';
