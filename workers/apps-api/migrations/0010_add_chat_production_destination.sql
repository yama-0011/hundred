ALTER TABLE creative_ia_chats
  ADD COLUMN production_destination TEXT NOT NULL DEFAULT 'wordpress'
  CHECK (production_destination IN ('wordpress', 'instagram'));

ALTER TABLE creative_ia_chats
  ADD COLUMN instagram_content_type TEXT NOT NULL DEFAULT 'feed'
  CHECK (instagram_content_type IN ('feed', 'stories', 'reels'));
