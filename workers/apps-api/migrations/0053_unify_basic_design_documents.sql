-- 基本設計書は種類ごとに独立した文書として管理する。
-- 過去の「対象区分ごとに一冊へ統合する」方針で作られた制約だけを除去する。
-- 文書やページの結合・削除は行わない。

DROP INDEX IF EXISTS idx_ai_desktop_design_documents_project_basic_design;
DROP INDEX IF EXISTS idx_ai_desktop_design_templates_project_basic_design;
