ALTER TABLE creative_ia_reference_items
  ADD COLUMN parent_reference_id TEXT
  REFERENCES creative_ia_reference_items(id)
  ON DELETE RESTRICT;

CREATE INDEX idx_creative_ia_reference_items_owner_parent
  ON creative_ia_reference_items(owner_user_id, parent_reference_id);
