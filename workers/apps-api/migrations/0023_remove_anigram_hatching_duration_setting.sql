PRAGMA foreign_keys = ON;

-- 孵化演出を使用しないため、既存値を即時孵化の0秒へ固定する。
UPDATE anigram_species_settings
SET hatching_duration_seconds = 0
WHERE hatching_duration_seconds <> 0;
