ALTER TABLE creative_ia_chats
  ADD COLUMN production_destination_confirmed INTEGER NOT NULL DEFAULT 1
  CHECK (production_destination_confirmed IN (0, 1));
