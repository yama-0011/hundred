-- プロジェクトの作成者が、メンバーごとに「閲覧のみ」か「閲覧・編集」かを選べるようにする。
-- 既存のメンバーは、これまでどおり閲覧のみ（0）として扱う。
ALTER TABLE ai_desktop_project_members
  ADD COLUMN can_edit INTEGER NOT NULL DEFAULT 0 CHECK (can_edit IN (0, 1));
