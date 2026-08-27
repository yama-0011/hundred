export interface AnigramEnv {
  DB: D1Database;
}

type LifeStage = "egg" | "hatching" | "baby" | "adult";
type LifeStatus = "alive" | "dead";

interface AnigramPetRow {
  id: string;
  owner_user_id: string;
  species: string;
  display_name: string;
  status: LifeStatus;
  life_stage: LifeStage;
  evolution_stage: string;
  hatch_points: number;
  fullness_points: number;
  state_calculated_at: number;
  last_fed_at: number | null;
  hatching_started_at: number | null;
  hatched_at: number | null;
  zero_started_at: number | null;
  evolution_started_at: number | null;
  died_at: number | null;
  created_at: number;
  updated_at: number;
  hatch_required_points: number;
  hatching_duration_seconds: number;
  initial_fullness_points: number;
  max_fullness_points: number;
  fullness_decay_rate_per_hour: number;
  starvation_grace_seconds: number;
  evolution_fullness_threshold: number;
  evolution_hold_seconds: number;
}

export interface AnigramGrowthEventInput {
  source: string;
  externalEventId: string;
  reactionType?: string | null;
  points: number;
  occurredAt?: number;
}

export class AnigramGameError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_FOUND") {
    super(code);
    this.name = "AnigramGameError";
  }
}

const defaultSpecies = "hedgehog";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function percentage(value: number, maximum: number) {
  if (maximum <= 0) return 0;
  return Math.round(clamp((value / maximum) * 100, 0, 100));
}

async function ensureUser(env: AnigramEnv, ownerUserId: string) {
  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id)
     DO UPDATE SET updated_at = unixepoch()`,
  )
    .bind(ownerUserId)
    .run();
}

async function ensurePet(env: AnigramEnv, ownerUserId: string) {
  await ensureUser(env, ownerUserId);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO anigram_pets (
       id, owner_user_id, species, status, life_stage, evolution_stage,
       hatch_points, fullness_points, state_calculated_at, created_at, updated_at
     )
     VALUES (?1, ?2, ?3, 'alive', 'egg', 'base', 0, 0, ?4, ?4, ?4)
     ON CONFLICT(owner_user_id) DO NOTHING`,
  )
    .bind(crypto.randomUUID(), ownerUserId, defaultSpecies, now)
    .run();
}

async function loadPet(env: AnigramEnv, ownerUserId: string) {
  const pet = await env.DB.prepare(
    `SELECT
       pet.*,
       settings.display_name,
       settings.hatch_required_points,
       settings.hatching_duration_seconds,
       settings.initial_fullness_points,
       settings.max_fullness_points,
       settings.fullness_decay_rate_per_hour,
       settings.starvation_grace_seconds,
       settings.evolution_fullness_threshold,
       settings.evolution_hold_seconds
     FROM anigram_pets AS pet
     JOIN anigram_species_settings AS settings
       ON settings.species = pet.species
     WHERE pet.owner_user_id = ?1`,
  )
    .bind(ownerUserId)
    .first<AnigramPetRow>();
  if (!pet) throw new AnigramGameError("NOT_FOUND");
  return pet;
}

async function recordStateHistory(
  env: AnigramEnv,
  pet: AnigramPetRow,
  eventType: string,
  previousValue: string | null,
  nextValue: string | null,
  reason: string,
  occurredAt: number,
) {
  await env.DB.prepare(
    `INSERT INTO anigram_state_history (
       id, owner_user_id, pet_id, event_type, previous_value, next_value,
       reason, occurred_at
     ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      crypto.randomUUID(),
      pet.owner_user_id,
      pet.id,
      eventType,
      previousValue,
      nextValue,
      reason,
      occurredAt,
    )
    .run();
}

/**
 * 保存済みの確定値へ現在時刻までの経過を反映する。
 * Unityやブラウザの時計をゲーム状態の正本として使用しない。
 */
async function settlePet(
  env: AnigramEnv,
  ownerUserId: string,
  requestedNow = Date.now(),
) {
  await ensurePet(env, ownerUserId);
  let pet = await loadPet(env, ownerUserId);
  const now = Math.max(requestedNow, pet.state_calculated_at);

  if (
    pet.status === "alive" &&
    pet.life_stage === "hatching" &&
    pet.hatching_started_at !== null &&
    now >= pet.hatching_started_at + pet.hatching_duration_seconds * 1000
  ) {
    const hatchedAt =
      pet.hatching_started_at + pet.hatching_duration_seconds * 1000;
    const initialFullness = Math.min(
      pet.initial_fullness_points,
      pet.max_fullness_points,
    );
    await env.DB.prepare(
      `UPDATE anigram_pets
          SET life_stage = 'baby',
              fullness_points = ?2,
              state_calculated_at = ?3,
              hatched_at = ?3,
              updated_at = ?1
        WHERE owner_user_id = ?4`,
    )
      .bind(now, initialFullness, hatchedAt, ownerUserId)
      .run();
    await recordStateHistory(
      env,
      pet,
      "life_stage_changed",
      "hatching",
      "baby",
      "hatching_duration_elapsed",
      hatchedAt,
    );
    pet = await loadPet(env, ownerUserId);
  }

  if (
    pet.status === "alive" &&
    (pet.life_stage === "baby" || pet.life_stage === "adult") &&
    now > pet.state_calculated_at
  ) {
    const elapsedHours = (now - pet.state_calculated_at) / 3_600_000;
    const decay =
      pet.max_fullness_points *
      pet.fullness_decay_rate_per_hour *
      elapsedHours;
    const settledFullness = Math.max(0, pet.fullness_points - decay);
    let zeroStartedAt = pet.zero_started_at;
    let status: LifeStatus = pet.status;
    let diedAt = pet.died_at;

    if (settledFullness <= 0) {
      if (zeroStartedAt === null) {
        const hourlyDecay =
          pet.max_fullness_points * pet.fullness_decay_rate_per_hour;
        const timeToZero =
          hourlyDecay > 0
            ? (pet.fullness_points / hourlyDecay) * 3_600_000
            : now - pet.state_calculated_at;
        zeroStartedAt = Math.min(
          now,
          Math.round(pet.state_calculated_at + timeToZero),
        );
      }
      const deathTime = zeroStartedAt + pet.starvation_grace_seconds * 1000;
      if (now >= deathTime) {
        status = "dead";
        diedAt = deathTime;
      }
    } else {
      zeroStartedAt = null;
    }

    const fullnessRatio = settledFullness / pet.max_fullness_points;
    const evolutionStartedAt =
      fullnessRatio >= pet.evolution_fullness_threshold
        ? (pet.evolution_started_at ?? now)
        : null;

    await env.DB.prepare(
      `UPDATE anigram_pets
          SET status = ?2,
              fullness_points = ?3,
              state_calculated_at = ?1,
              zero_started_at = ?4,
              evolution_started_at = ?5,
              died_at = ?6,
              updated_at = ?1
        WHERE owner_user_id = ?7`,
    )
      .bind(
        now,
        status,
        settledFullness,
        zeroStartedAt,
        evolutionStartedAt,
        diedAt,
        ownerUserId,
      )
      .run();
    if (pet.status !== status) {
      await recordStateHistory(
        env,
        pet,
        "status_changed",
        pet.status,
        status,
        "starvation_grace_elapsed",
        diedAt ?? now,
      );
    }
    pet = await loadPet(env, ownerUserId);
  }

  return pet;
}

function serializePet(pet: AnigramPetRow) {
  const beforeHatching =
    pet.life_stage === "egg" || pet.life_stage === "hatching";
  const hatchProgressPercent = beforeHatching
    ? percentage(pet.hatch_points, pet.hatch_required_points)
    : null;
  const fullnessPercent = beforeHatching
    ? null
    : percentage(pet.fullness_points, pet.max_fullness_points);
  const motion =
    pet.status === "dead"
      ? "dead"
      : pet.life_stage === "egg"
        ? "egg_idle"
        : pet.life_stage === "hatching"
          ? "hatching"
          : "idle";

  return {
    id: pet.id,
    species: pet.species,
    displayName: pet.display_name,
    status: pet.status,
    lifeStage: pet.life_stage,
    evolutionStage: pet.evolution_stage,
    hatchPoints: beforeHatching ? Math.round(pet.hatch_points * 100) / 100 : null,
    hatchRequiredPoints: beforeHatching ? pet.hatch_required_points : null,
    hatchProgressPercent,
    fullnessPoints: beforeHatching
      ? null
      : Math.round(pet.fullness_points * 100) / 100,
    maxFullnessPoints: beforeHatching ? null : pet.max_fullness_points,
    fullnessPercent,
    lastFedAt: pet.last_fed_at,
    hatchingStartedAt: pet.hatching_started_at,
    hatchedAt: pet.hatched_at,
    zeroStartedAt: pet.zero_started_at,
    diedAt: pet.died_at,
    updatedAt: pet.updated_at,
    displayState: {
      species: pet.species,
      status: pet.status,
      lifeStage: pet.life_stage,
      evolutionStage: pet.evolution_stage,
      hatchProgressPercent,
      fullnessPercent,
      motion,
    },
  };
}

export async function getAnigramPetState(
  env: AnigramEnv,
  ownerUserId: string,
) {
  return serializePet(await settlePet(env, ownerUserId));
}

/**
 * InstagramやHundred内操作を、共通形式の成長イベントとして反映する。
 * source + externalEventIdの一意制約により、同じ反応を二重加算しない。
 */
export async function addAnigramGrowthEvent(
  env: AnigramEnv,
  ownerUserId: string,
  input: AnigramGrowthEventInput,
) {
  const points = Number(input.points);
  if (
    !input.source.trim() ||
    !input.externalEventId.trim() ||
    !Number.isFinite(points) ||
    points <= 0
  ) {
    throw new AnigramGameError("INVALID_INPUT");
  }

  const existing = await env.DB.prepare(
    `SELECT id
       FROM anigram_growth_events
      WHERE owner_user_id = ?1 AND source = ?2 AND external_event_id = ?3`,
  )
    .bind(ownerUserId, input.source, input.externalEventId)
    .first<{ id: string }>();
  if (existing) {
    return {
      duplicate: true,
      appliedPoints: 0,
      pet: await getAnigramPetState(env, ownerUserId),
    };
  }

  const now = Date.now();
  const occurredAt =
    typeof input.occurredAt === "number" && Number.isFinite(input.occurredAt)
      ? Math.min(Math.max(0, Math.floor(input.occurredAt)), now)
      : now;
  const pet = await settlePet(env, ownerUserId, now);
  let appliedTarget: "hatch" | "fullness" | "ignored" = "ignored";
  let appliedPoints = 0;
  let nextHatchPoints = pet.hatch_points;
  let nextFullnessPoints = pet.fullness_points;
  let nextLifeStage = pet.life_stage;
  let hatchingStartedAt = pet.hatching_started_at;
  let lastFedAt = pet.last_fed_at;
  let zeroStartedAt = pet.zero_started_at;

  if (pet.status === "alive" && pet.life_stage === "egg") {
    appliedTarget = "hatch";
    appliedPoints = Math.min(points, pet.hatch_required_points - pet.hatch_points);
    nextHatchPoints = pet.hatch_points + appliedPoints;
    if (nextHatchPoints >= pet.hatch_required_points) {
      nextLifeStage = "hatching";
      hatchingStartedAt = now;
    }
  } else if (
    pet.status === "alive" &&
    (pet.life_stage === "baby" || pet.life_stage === "adult")
  ) {
    appliedTarget = "fullness";
    appliedPoints = Math.min(points, pet.max_fullness_points - pet.fullness_points);
    nextFullnessPoints = pet.fullness_points + appliedPoints;
    if (appliedPoints > 0) lastFedAt = now;
    if (nextFullnessPoints > 0) zeroStartedAt = null;
  }
  appliedPoints = Math.max(0, appliedPoints);

  const eventId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO anigram_growth_events (
         id, owner_user_id, pet_id, source, external_event_id, reaction_type,
         applied_target, requested_points, applied_points, occurred_at,
         applied_at, created_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)`,
    ).bind(
      eventId,
      ownerUserId,
      pet.id,
      input.source.trim(),
      input.externalEventId.trim(),
      input.reactionType?.trim() || null,
      appliedTarget,
      points,
      appliedPoints,
      occurredAt,
      now,
    ),
    env.DB.prepare(
      `UPDATE anigram_pets
          SET life_stage = ?2,
              hatch_points = ?3,
              fullness_points = ?4,
              hatching_started_at = ?5,
              last_fed_at = ?6,
              zero_started_at = ?7,
              state_calculated_at = ?1,
              updated_at = ?1
        WHERE id = ?8 AND owner_user_id = ?9`,
    ).bind(
      now,
      nextLifeStage,
      nextHatchPoints,
      nextFullnessPoints,
      hatchingStartedAt,
      lastFedAt,
      zeroStartedAt,
      pet.id,
      ownerUserId,
    ),
  ]);

  if (pet.life_stage !== nextLifeStage) {
    await recordStateHistory(
      env,
      pet,
      "life_stage_changed",
      pet.life_stage,
      nextLifeStage,
      "hatch_points_reached",
      now,
    );
  }

  return {
    duplicate: false,
    appliedPoints,
    pet: await getAnigramPetState(env, ownerUserId),
  };
}

export async function listAnigramGrowthEvents(
  env: AnigramEnv,
  ownerUserId: string,
  requestedLimit = 20,
) {
  const limit = Math.floor(clamp(requestedLimit, 1, 100));
  const result = await env.DB.prepare(
    `SELECT id, source, reaction_type, applied_target, requested_points,
            applied_points, occurred_at, applied_at
       FROM anigram_growth_events
      WHERE owner_user_id = ?1
      ORDER BY applied_at DESC
      LIMIT ?2`,
  )
    .bind(ownerUserId, limit)
    .all<{
      id: string;
      source: string;
      reaction_type: string | null;
      applied_target: string;
      requested_points: number;
      applied_points: number;
      occurred_at: number;
      applied_at: number;
    }>();
  return result.results.map((event) => ({
    id: event.id,
    source: event.source,
    reactionType: event.reaction_type,
    appliedTarget: event.applied_target,
    requestedPoints: event.requested_points,
    appliedPoints: event.applied_points,
    occurredAt: event.occurred_at,
    appliedAt: event.applied_at,
  }));
}
