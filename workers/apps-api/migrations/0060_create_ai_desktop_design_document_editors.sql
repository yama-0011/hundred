-- ドキュメントの編集画面を開いている人を記録し、ほかのメンバーに「編集中」と表示する。
-- 編集画面は定期的に heartbeat_at を更新し、一定時間更新がない記録は表示しない。
CREATE TABLE ai_desktop_design_document_editors (
  design_document_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  heartbeat_at INTEGER NOT NULL,
  PRIMARY KEY (design_document_id, user_id),
  FOREIGN KEY (design_document_id) REFERENCES ai_desktop_design_documents(design_document_id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_desktop_design_document_editors_heartbeat
  ON ai_desktop_design_document_editors(heartbeat_at);
