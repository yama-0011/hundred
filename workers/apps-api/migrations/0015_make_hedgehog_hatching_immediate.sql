-- Instagram反応が孵化条件へ到達した時点で、ハリネズミを即座に幼体へ遷移させる。
-- hatchingの仕組みは、将来別の動物で演出時間を設ける場合に備えて残す。
UPDATE anigram_species_settings
SET hatching_duration_seconds = 0,
    updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE species = 'hedgehog';
