PRAGMA foreign_keys = ON;

ALTER TABLE anigram_instagram_story_publications
  ADD COLUMN render_id TEXT
  REFERENCES anigram_story_renders(id)
  ON DELETE SET NULL;

CREATE INDEX idx_anigram_story_publications_render
  ON anigram_instagram_story_publications(render_id);
