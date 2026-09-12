ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN story_title_template TEXT NOT NULL DEFAULT '{status}';

ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN story_message_template TEXT NOT NULL DEFAULT '{pet_name}をみんなで育てよう。';

ALTER TABLE anigram_instagram_delivery_settings
  ADD COLUMN story_reaction_template TEXT NOT NULL DEFAULT 'あなたの反応が、{pet_name}の成長につながります。';
