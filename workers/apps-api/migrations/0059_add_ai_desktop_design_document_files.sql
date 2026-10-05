-- ドキュメントとして、AI Desktopで作成した文書のほかにPDF・Word・Excelのファイルを取り込めるようにする。
-- ファイル本体はR2に保存し、ここには保存先と表示用の情報だけを持つ。既存のドキュメントは document として扱う。
ALTER TABLE ai_desktop_design_documents
  ADD COLUMN format TEXT NOT NULL DEFAULT 'document' CHECK (format IN ('document', 'pdf', 'word', 'excel'));
ALTER TABLE ai_desktop_design_documents ADD COLUMN file_key TEXT;
ALTER TABLE ai_desktop_design_documents ADD COLUMN file_name TEXT;
ALTER TABLE ai_desktop_design_documents ADD COLUMN file_size INTEGER;
ALTER TABLE ai_desktop_design_documents ADD COLUMN file_content_type TEXT;
