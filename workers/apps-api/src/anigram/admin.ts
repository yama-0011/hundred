import { getAnigramPetState, type AnigramEnv } from "./game";
import type { InstagramSyncSummary } from "../instagram/insights";

interface AnigramSettingsRow {
  species: string;
  display_name: string;
  hatch_required_points: number;
  hatching_duration_seconds: number;
  initial_fullness_points: number;
  max_fullness_points: number;
  fullness_storage_limit_percent: number;
  fullness_decay_rate_per_hour: number;
  starvation_grace_seconds: number;
  evolution_fullness_threshold: number;
  evolution_hold_seconds: number;
  next_evolution_stage: string;
  updated_at: number;
}

interface AnigramSettingsHistoryRow {
  id: string;
  species: string;
  updated_by_user_id: string;
  previous_settings_json: string;
  next_settings_json: string;
  updated_at: number;
}

interface AnigramAdminUserRow {
  user_id: string;
  registered_by_user_id: string | null;
  created_at: number;
}

interface AnigramInstagramDeliverySettingsRow {
  enabled: number;
  species: string;
  delivery_time: string;
  timezone: string;
  reaction_sync_enabled: number;
  sync_pause_reason: string | null;
  sync_paused_by_user_id: string | null;
  sync_paused_at: number | null;
  last_sync_at: number | null;
  last_sync_status: "success" | "partial" | "failed" | null;
  updated_by_user_id: string | null;
  updated_at: number;
}

interface AnigramInstagramSyncRunRow {
  id: string;
  trigger_type: "cron" | "manual";
  triggered_by_user_id: string | null;
  status: "success" | "partial" | "failed";
  processed_connections: number;
  succeeded_connections: number;
  failed_connections: number;
  stories_checked: number;
  reaction_increase: number;
  applied_points: number;
  failures_json: string;
  started_at: number;
  completed_at: number;
}

export class AnigramAdminSettingsError extends Error {
  constructor(
    readonly code: "INVALID_INPUT" | "NOT_FOUND" | "LAST_ADMIN",
  ) {
    super(code);
    this.name = "AnigramAdminSettingsError";
  }
}

function normalizeAdminUserId(value: unknown) {
  if (typeof value !== "string") {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_+=,.@-]+$/u.test(normalized)
  ) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function historyDeletionTarget(value: unknown) {
  if (!isRecord(value)) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  if (value.all === true) return null;
  if (
    typeof value.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.id,
    )
  ) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  return value.id;
}

function requiredNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  integer = false,
) {
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < minimum ||
    parsed > maximum ||
    (integer && !Number.isInteger(parsed))
  ) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  return parsed;
}

function requiredStage(value: unknown) {
  if (typeof value !== "string") {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const normalized = value.trim();
  if (!/^[a-z][a-z0-9_]{0,39}$/u.test(normalized)) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  return normalized;
}

function requiredDeliveryTime(value: unknown) {
  if (typeof value !== "string" || !/^\d{2}:\d{2}$/u.test(value)) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  return value;
}

function optionalPauseReason(value: unknown, syncEnabled: boolean) {
  if (syncEnabled) return null;
  if (typeof value !== "string") {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  return normalized;
}

function serializeInstagramDeliverySettings(
  row: AnigramInstagramDeliverySettingsRow,
) {
  return {
    enabled: row.enabled === 1,
    species: row.species,
    deliveryTime: row.delivery_time,
    timezone: row.timezone,
    reactionSyncEnabled: row.reaction_sync_enabled === 1,
    syncPauseReason: row.sync_pause_reason,
    syncPausedByUserId: row.sync_paused_by_user_id,
    syncPausedAt: row.sync_paused_at,
    lastSyncAt: row.last_sync_at,
    lastSyncStatus: row.last_sync_status,
    updatedByUserId: row.updated_by_user_id,
    updatedAt: row.updated_at,
  };
}

function serializeSettings(row: AnigramSettingsRow) {
  return {
    species: row.species,
    displayName: row.display_name,
    hatchRequiredPoints: row.hatch_required_points,
    hatchingDurationSeconds: row.hatching_duration_seconds,
    initialFullnessPoints: row.initial_fullness_points,
    maxFullnessPoints: row.max_fullness_points,
    fullnessStorageLimitPercent: row.fullness_storage_limit_percent,
    fullnessDecayPercentPerHour: row.fullness_decay_rate_per_hour * 100,
    starvationGraceSeconds: row.starvation_grace_seconds,
    evolutionFullnessThresholdPercent:
      row.evolution_fullness_threshold * 100,
    evolutionHoldSeconds: row.evolution_hold_seconds,
    nextEvolutionStage: row.next_evolution_stage,
    updatedAt: row.updated_at,
  };
}

async function loadSettings(env: AnigramEnv, species: string) {
  const row = await env.DB.prepare(
    `SELECT species, display_name, hatch_required_points,
            hatching_duration_seconds, initial_fullness_points,
            max_fullness_points, fullness_storage_limit_percent,
            fullness_decay_rate_per_hour,
            starvation_grace_seconds, evolution_fullness_threshold,
            evolution_hold_seconds, next_evolution_stage, updated_at
       FROM anigram_species_settings
      WHERE species = ?1`,
  )
    .bind(species)
    .first<AnigramSettingsRow>();
  if (!row) throw new AnigramAdminSettingsError("NOT_FOUND");
  return row;
}

export async function getAnigramAdminSettings(env: AnigramEnv) {
  const [
    settingsResult,
    historyResult,
    administratorsResult,
    instagramDeliveryRow,
  ] = await Promise.all([
    env.DB.prepare(
      `SELECT species, display_name, hatch_required_points,
              hatching_duration_seconds, initial_fullness_points,
              max_fullness_points, fullness_storage_limit_percent,
              fullness_decay_rate_per_hour,
              starvation_grace_seconds, evolution_fullness_threshold,
              evolution_hold_seconds, next_evolution_stage, updated_at
         FROM anigram_species_settings
        ORDER BY display_name ASC`,
    ).all<AnigramSettingsRow>(),
    env.DB.prepare(
      `SELECT id, species, updated_by_user_id, previous_settings_json,
              next_settings_json, updated_at
         FROM anigram_settings_history
        ORDER BY updated_at DESC
        LIMIT 20`,
    ).all<AnigramSettingsHistoryRow>(),
    env.DB.prepare(
      `SELECT user_id, registered_by_user_id, created_at
         FROM anigram_admin_users
        ORDER BY created_at ASC, user_id ASC`,
    ).all<AnigramAdminUserRow>(),
    env.DB.prepare(
      `SELECT enabled, species, delivery_time, timezone,
              reaction_sync_enabled, sync_pause_reason,
              sync_paused_by_user_id, sync_paused_at,
              last_sync_at, last_sync_status,
              updated_by_user_id, updated_at
         FROM anigram_instagram_delivery_settings
        WHERE id = 1`,
    ).first<AnigramInstagramDeliverySettingsRow>(),
  ]);

  if (!instagramDeliveryRow) {
    throw new AnigramAdminSettingsError("NOT_FOUND");
  }

  return {
    settings: settingsResult.results.map(serializeSettings),
    history: historyResult.results.map((row) => ({
      id: row.id,
      species: row.species,
      updatedByUserId: row.updated_by_user_id,
      previousSettings: JSON.parse(row.previous_settings_json) as unknown,
      nextSettings: JSON.parse(row.next_settings_json) as unknown,
      updatedAt: row.updated_at,
    })),
    administrators: administratorsResult.results.map((row) => ({
      userId: row.user_id,
      registeredByUserId: row.registered_by_user_id,
      createdAt: row.created_at,
    })),
    instagramDelivery: serializeInstagramDeliverySettings(
      instagramDeliveryRow,
    ),
  };
}

export async function updateAnigramInstagramDeliverySettings(
  env: AnigramEnv,
  updatedByUserId: string,
  value: unknown,
) {
  if (!isRecord(value) || typeof value.enabled !== "boolean") {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const species = requiredStage(value.species);
  const deliveryTime = requiredDeliveryTime(value.deliveryTime);
  if (typeof value.reactionSyncEnabled !== "boolean") {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const reactionSyncEnabled = value.reactionSyncEnabled;
  const syncPauseReason = optionalPauseReason(
    value.syncPauseReason,
    reactionSyncEnabled,
  );
  const speciesExists = await env.DB.prepare(
    `SELECT species FROM anigram_species_settings WHERE species = ?1`,
  )
    .bind(species)
    .first<{ species: string }>();
  if (!speciesExists) {
    throw new AnigramAdminSettingsError("NOT_FOUND");
  }

  const now = Date.now();
  await env.DB.prepare(
    `UPDATE anigram_instagram_delivery_settings
        SET enabled = ?1,
            species = ?2,
            delivery_time = ?3,
            timezone = 'Asia/Tokyo',
            reaction_sync_enabled = ?4,
            sync_pause_reason = ?5,
            sync_paused_by_user_id = ?6,
            sync_paused_at = ?7,
            updated_by_user_id = ?8,
            updated_at = ?9
      WHERE id = 1`,
  )
    .bind(
      value.enabled ? 1 : 0,
      species,
      deliveryTime,
      reactionSyncEnabled ? 1 : 0,
      syncPauseReason,
      reactionSyncEnabled ? null : updatedByUserId,
      reactionSyncEnabled ? null : now,
      updatedByUserId,
      now,
    )
    .run();

  const updated = await env.DB.prepare(
    `SELECT enabled, species, delivery_time, timezone,
            reaction_sync_enabled, sync_pause_reason,
            sync_paused_by_user_id, sync_paused_at,
            last_sync_at, last_sync_status,
            updated_by_user_id, updated_at
       FROM anigram_instagram_delivery_settings
      WHERE id = 1`,
  ).first<AnigramInstagramDeliverySettingsRow>();
  if (!updated) throw new AnigramAdminSettingsError("NOT_FOUND");
  return serializeInstagramDeliverySettings(updated);
}

export async function getAnigramInstagramReactionSyncControl(
  env: AnigramEnv,
) {
  const row = await env.DB.prepare(
    `SELECT reaction_sync_enabled
       FROM anigram_instagram_delivery_settings
      WHERE id = 1`,
  ).first<{ reaction_sync_enabled: number }>();
  return row?.reaction_sync_enabled === 1;
}

export async function recordAnigramInstagramSyncResult(
  env: AnigramEnv,
  result: InstagramSyncSummary,
  triggerType: "cron" | "manual",
  startedAt: number,
  triggeredByUserId: string | null = null,
) {
  const status =
    result.failed === 0
      ? "success"
      : result.succeeded > 0
        ? "partial"
        : "failed";
  const completedAt = Date.now();
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO anigram_instagram_sync_runs (
         id, trigger_type, triggered_by_user_id, status,
         processed_connections, succeeded_connections, failed_connections,
         stories_checked, reaction_increase, applied_points, failures_json,
         started_at, completed_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)`,
    ).bind(
      id,
      triggerType,
      triggeredByUserId,
      status,
      result.processed,
      result.succeeded,
      result.failed,
      result.storiesChecked,
      result.reactionIncrease,
      result.appliedPoints,
      JSON.stringify(result.failures),
      startedAt,
      completedAt,
    ),
    env.DB.prepare(
      `UPDATE anigram_instagram_delivery_settings
          SET last_sync_at = ?1,
              last_sync_status = ?2
        WHERE id = 1`,
    ).bind(completedAt, status),
  ]);
  return {
    id,
    triggerType,
    triggeredByUserId,
    status,
    processedConnections: result.processed,
    succeededConnections: result.succeeded,
    failedConnections: result.failed,
    storiesChecked: result.storiesChecked,
    reactionIncrease: result.reactionIncrease,
    appliedPoints: result.appliedPoints,
    failures: result.failures,
    startedAt,
    completedAt,
  };
}

export async function listAnigramInstagramSyncRuns(
  env: AnigramEnv,
  requestedLimit = 20,
) {
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 50);
  const result = await env.DB.prepare(
    `SELECT id, trigger_type, triggered_by_user_id, status,
            processed_connections, succeeded_connections, failed_connections,
            stories_checked, reaction_increase, applied_points, failures_json,
            started_at, completed_at
       FROM anigram_instagram_sync_runs
      ORDER BY completed_at DESC
      LIMIT ?1`,
  )
    .bind(limit)
    .all<AnigramInstagramSyncRunRow>();

  return result.results.map((row) => ({
    id: row.id,
    triggerType: row.trigger_type,
    triggeredByUserId: row.triggered_by_user_id,
    status: row.status,
    processedConnections: row.processed_connections,
    succeededConnections: row.succeeded_connections,
    failedConnections: row.failed_connections,
    storiesChecked: row.stories_checked,
    reactionIncrease: row.reaction_increase,
    appliedPoints: row.applied_points,
    failures: JSON.parse(row.failures_json) as unknown,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }));
}

async function deleteHistoryRows(
  env: AnigramEnv,
  table: "anigram_settings_history" | "anigram_instagram_sync_runs",
  value: unknown,
) {
  const id = historyDeletionTarget(value);
  const result = id === null
    ? await env.DB.prepare(`DELETE FROM ${table}`).run()
    : await env.DB.prepare(`DELETE FROM ${table} WHERE id = ?1`).bind(id).run();
  const deletedCount = result.meta.changes ?? 0;
  if (id !== null && deletedCount === 0) {
    throw new AnigramAdminSettingsError("NOT_FOUND");
  }
  return { deletedCount };
}

export async function deleteAnigramSettingsHistory(
  env: AnigramEnv,
  value: unknown,
) {
  return deleteHistoryRows(env, "anigram_settings_history", value);
}

export async function deleteAnigramInstagramSyncRuns(
  env: AnigramEnv,
  value: unknown,
) {
  return deleteHistoryRows(env, "anigram_instagram_sync_runs", value);
}

export async function isAnigramAdministrator(
  env: AnigramEnv,
  userId: string,
) {
  const administrator = await env.DB.prepare(
    `SELECT user_id FROM anigram_admin_users WHERE user_id = ?1`,
  )
    .bind(userId)
    .first<{ user_id: string }>();
  return administrator !== null;
}

export async function registerAnigramAdministrator(
  env: AnigramEnv,
  registeredByUserId: string,
  value: unknown,
) {
  if (!isRecord(value)) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const userId = normalizeAdminUserId(value.userId);
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO anigram_admin_users (user_id, registered_by_user_id, created_at)
     VALUES (?1, ?2, ?3)
     ON CONFLICT(user_id) DO NOTHING`,
  )
    .bind(userId, registeredByUserId, now)
    .run();
  return { userId, registeredByUserId, createdAt: now };
}

export async function removeAnigramAdministrator(
  env: AnigramEnv,
  value: unknown,
) {
  if (!isRecord(value)) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }
  const userId = normalizeAdminUserId(value.userId);
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM anigram_admin_users`,
  ).first<{ count: number }>();
  if ((count?.count ?? 0) <= 1) {
    throw new AnigramAdminSettingsError("LAST_ADMIN");
  }
  const result = await env.DB.prepare(
    `DELETE FROM anigram_admin_users WHERE user_id = ?1`,
  )
    .bind(userId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new AnigramAdminSettingsError("NOT_FOUND");
  }
}

export async function updateAnigramAdminSettings(
  env: AnigramEnv,
  updatedByUserId: string,
  species: string,
  value: unknown,
) {
  if (!isRecord(value)) {
    throw new AnigramAdminSettingsError("INVALID_INPUT");
  }

  await env.DB.prepare(
    `INSERT INTO users (owner_user_id)
     VALUES (?1)
     ON CONFLICT(owner_user_id)
     DO UPDATE SET updated_at = unixepoch()`,
  )
    .bind(updatedByUserId)
    .run();

  const previousRow = await loadSettings(env, species);
  const maxFullnessPoints = requiredNumber(
    value.maxFullnessPoints,
    1,
    1_000_000,
  );
  const nextSettings = {
    hatchRequiredPoints: requiredNumber(
      value.hatchRequiredPoints,
      1,
      1_000_000,
      true,
    ),
    hatchingDurationSeconds: requiredNumber(
      value.hatchingDurationSeconds,
      0,
      86_400,
      true,
    ),
    initialFullnessPoints: requiredNumber(
      value.initialFullnessPoints,
      0,
      maxFullnessPoints,
    ),
    maxFullnessPoints,
    fullnessStorageLimitPercent:
      value.fullnessStorageLimitPercent === undefined
        ? previousRow.fullness_storage_limit_percent
        : requiredNumber(value.fullnessStorageLimitPercent, 100, 500),
    fullnessDecayPercentPerHour: requiredNumber(
      value.fullnessDecayPercentPerHour,
      0,
      100,
    ),
    starvationGraceSeconds: requiredNumber(
      value.starvationGraceSeconds,
      0,
      31_536_000,
      true,
    ),
    evolutionFullnessThresholdPercent: requiredNumber(
      value.evolutionFullnessThresholdPercent,
      0,
      100,
    ),
    evolutionHoldSeconds: requiredNumber(
      value.evolutionHoldSeconds,
      0,
      31_536_000,
      true,
    ),
    nextEvolutionStage: requiredStage(value.nextEvolutionStage),
  };

  // 新しい減少率を過去の経過時間へ遡及させないため、更新前の設定で状態を確定する。
  const petOwners = await env.DB.prepare(
    `SELECT owner_user_id FROM anigram_pets WHERE species = ?1`,
  )
    .bind(species)
    .all<{ owner_user_id: string }>();
  for (const pet of petOwners.results) {
    await getAnigramPetState(env, pet.owner_user_id);
  }

  const now = Date.now();
  const previousSettings = serializeSettings(previousRow);
  const newlyHatchingPets = await env.DB.prepare(
    `SELECT id, owner_user_id
       FROM anigram_pets
      WHERE species = ?1
        AND status = 'alive'
        AND life_stage = 'egg'
        AND hatch_points >= ?2`,
  )
    .bind(species, nextSettings.hatchRequiredPoints)
    .all<{ id: string; owner_user_id: string }>();
  const statements = [
    env.DB.prepare(
      `UPDATE anigram_species_settings
          SET hatch_required_points = ?2,
              hatching_duration_seconds = ?3,
              initial_fullness_points = ?4,
              max_fullness_points = ?5,
              fullness_storage_limit_percent = ?6,
              fullness_decay_rate_per_hour = ?7,
              starvation_grace_seconds = ?8,
              evolution_fullness_threshold = ?9,
              evolution_hold_seconds = ?10,
              next_evolution_stage = ?11,
              updated_at = ?12
        WHERE species = ?1`,
    ).bind(
      species,
      nextSettings.hatchRequiredPoints,
      nextSettings.hatchingDurationSeconds,
      nextSettings.initialFullnessPoints,
      nextSettings.maxFullnessPoints,
      nextSettings.fullnessStorageLimitPercent,
      nextSettings.fullnessDecayPercentPerHour / 100,
      nextSettings.starvationGraceSeconds,
      nextSettings.evolutionFullnessThresholdPercent / 100,
      nextSettings.evolutionHoldSeconds,
      nextSettings.nextEvolutionStage,
      now,
    ),
    env.DB.prepare(
      `UPDATE anigram_pets
          SET hatch_points = MIN(hatch_points, ?2),
              fullness_points = MIN(fullness_points, ?3 * ?4 / 100.0),
              life_stage = CASE
                WHEN status = 'alive' AND life_stage = 'egg'
                  AND hatch_points >= ?2 THEN 'hatching'
                ELSE life_stage
              END,
              hatching_started_at = CASE
                WHEN status = 'alive' AND life_stage = 'egg'
                  AND hatch_points >= ?2 THEN ?5
                ELSE hatching_started_at
              END,
              updated_at = ?5
        WHERE species = ?1`,
    ).bind(
      species,
      nextSettings.hatchRequiredPoints,
      nextSettings.maxFullnessPoints,
      nextSettings.fullnessStorageLimitPercent,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO anigram_settings_history (
         id, species, updated_by_user_id, previous_settings_json,
         next_settings_json, updated_at
       ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    ).bind(
      crypto.randomUUID(),
      species,
      updatedByUserId,
      JSON.stringify(previousSettings),
      JSON.stringify({ species, ...nextSettings, updatedAt: now }),
      now,
    ),
    ...newlyHatchingPets.results.map((pet) =>
      env.DB.prepare(
        `INSERT INTO anigram_state_history (
           id, owner_user_id, pet_id, event_type, previous_value, next_value,
           reason, occurred_at
         ) VALUES (?1, ?2, ?3, 'life_stage_changed', 'egg', 'hatching',
                   'hatch_setting_threshold_reached', ?4)`,
      ).bind(crypto.randomUUID(), pet.owner_user_id, pet.id, now),
    ),
  ];
  await env.DB.batch(statements);

  // 閾値や待機時間の変更による孵化・進化条件を新設定で直ちに再評価する。
  for (const pet of petOwners.results) {
    await getAnigramPetState(env, pet.owner_user_id);
  }

  return serializeSettings(await loadSettings(env, species));
}
