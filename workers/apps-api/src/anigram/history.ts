import { getAnigramPetState, type AnigramEnv } from "./game";

const japanOffsetMilliseconds = 9 * 60 * 60 * 1000;

function startOfTodayInJapan(now: number) {
  const japanNow = new Date(now + japanOffsetMilliseconds);
  return (
    Date.UTC(
      japanNow.getUTCFullYear(),
      japanNow.getUTCMonth(),
      japanNow.getUTCDate(),
    ) - japanOffsetMilliseconds
  );
}

export async function getAnigramHistory(
  env: AnigramEnv,
  requestedLimit = 50,
) {
  const limit = Math.min(Math.max(Math.floor(requestedLimit), 1), 100);
  const now = Date.now();
  const todayStartedAt = startOfTodayInJapan(now);
  const pet = await getAnigramPetState(env);
  const [growthResult, stateResult, todaySummary] = await Promise.all([
    env.DB.prepare(
      `SELECT id, source, reaction_type, applied_target, requested_points,
              applied_points, occurred_at, applied_at
         FROM anigram_growth_events
        WHERE pet_id = ?1
        ORDER BY applied_at DESC
        LIMIT ?2`,
    )
      .bind(pet.id, limit)
      .all<{
        id: string;
        source: string;
        reaction_type: string | null;
        applied_target: string;
        requested_points: number;
        applied_points: number;
        occurred_at: number;
        applied_at: number;
      }>(),
    env.DB.prepare(
      `SELECT id, event_type, previous_value, next_value, reason, occurred_at
         FROM anigram_state_history
        WHERE pet_id = ?1
        ORDER BY occurred_at DESC
        LIMIT ?2`,
    )
      .bind(pet.id, limit)
      .all<{
        id: string;
        event_type: string;
        previous_value: string | null;
        next_value: string | null;
        reason: string;
        occurred_at: number;
      }>(),
    env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE
           WHEN source = 'instagram_story' THEN requested_points ELSE 0 END), 0)
           AS instagram_reactions,
         COALESCE(SUM(requested_points), 0) AS requested_points,
         COALESCE(SUM(applied_points), 0) AS applied_points,
         COUNT(*) AS event_count
       FROM anigram_growth_events
       WHERE pet_id = ?1 AND occurred_at >= ?2 AND occurred_at <= ?3`,
    )
      .bind(pet.id, todayStartedAt, now)
      .first<{
        instagram_reactions: number;
        requested_points: number;
        applied_points: number;
        event_count: number;
      }>(),
  ]);

  return {
    pet,
    today: {
      startedAt: todayStartedAt,
      instagramReactions: todaySummary?.instagram_reactions ?? 0,
      requestedPoints: todaySummary?.requested_points ?? 0,
      appliedPoints: todaySummary?.applied_points ?? 0,
      eventCount: todaySummary?.event_count ?? 0,
    },
    growthEvents: growthResult.results.map((event) => ({
      id: event.id,
      source: event.source,
      reactionType: event.reaction_type,
      appliedTarget: event.applied_target,
      requestedPoints: event.requested_points,
      appliedPoints: event.applied_points,
      occurredAt: event.occurred_at,
      appliedAt: event.applied_at,
    })),
    stateEvents: stateResult.results.map((event) => ({
      id: event.id,
      eventType: event.event_type,
      previousValue: event.previous_value,
      nextValue: event.next_value,
      reason: event.reason,
      occurredAt: event.occurred_at,
    })),
  };
}
