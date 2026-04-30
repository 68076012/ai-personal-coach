import { and, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "./client";
import {
  agent_memory,
  conversations,
  daily_logs,
  daily_plans,
  meal_library,
  meals,
  morning_reports,
  pending_plans,
  users,
  workouts,
  type AgentType,
  type MealType,
  type NewAgentMemory,
  type NewConversation,
  type NewDailyPlan,
  type NewMeal,
  type NewMealLibraryEntry,
  type NewPendingPlan,
  type NewWorkout,
  type PendingPlanDay,
  type UserId,
} from "./schema";

// ===== Users =====
export async function getUser(userId: UserId) {
  const [u] = await db.select().from(users).where(eq(users.id, userId));
  return u ?? null;
}

export async function listUsers() {
  return db.select().from(users);
}

export async function updateUser(
  userId: UserId,
  patch: Partial<typeof users.$inferInsert>,
) {
  const [u] = await db
    .update(users)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(users.id, userId))
    .returning();
  return u ?? null;
}

// ===== Meals =====
export async function insertMeal(row: NewMeal) {
  const [m] = await db.insert(meals).values(row).returning();
  return m;
}

export async function getMealsSince(userId: UserId, since: Date) {
  return db
    .select()
    .from(meals)
    .where(and(eq(meals.user_id, userId), gte(meals.datetime, since)))
    .orderBy(desc(meals.datetime));
}

export async function getRecentMeals(userId: UserId, limit = 5) {
  return db
    .select()
    .from(meals)
    .where(eq(meals.user_id, userId))
    .orderBy(desc(meals.datetime))
    .limit(limit);
}

// ===== Workouts =====
export async function insertWorkout(row: NewWorkout) {
  const [w] = await db.insert(workouts).values(row).returning();
  return w;
}

export async function deleteMealById(userId: UserId, id: string) {
  const [row] = await db
    .delete(meals)
    .where(and(eq(meals.id, id), eq(meals.user_id, userId)))
    .returning();
  return row ?? null;
}

export async function deleteWorkoutById(userId: UserId, id: string) {
  const [row] = await db
    .delete(workouts)
    .where(and(eq(workouts.id, id), eq(workouts.user_id, userId)))
    .returning();
  return row ?? null;
}

export async function getWorkoutsSince(userId: UserId, since: Date) {
  return db
    .select()
    .from(workouts)
    .where(and(eq(workouts.user_id, userId), gte(workouts.datetime, since)))
    .orderBy(desc(workouts.datetime));
}

export async function getRecentWorkouts(userId: UserId, limit = 5) {
  return db
    .select()
    .from(workouts)
    .where(eq(workouts.user_id, userId))
    .orderBy(desc(workouts.datetime))
    .limit(limit);
}

// ===== Daily plans =====
export async function getDailyPlan(userId: UserId, date: string) {
  const [p] = await db
    .select()
    .from(daily_plans)
    .where(and(eq(daily_plans.user_id, userId), eq(daily_plans.date, date)));
  return p ?? null;
}

export async function upsertDailyPlan(row: NewDailyPlan) {
  const [p] = await db
    .insert(daily_plans)
    .values(row)
    .onConflictDoUpdate({
      target: [daily_plans.user_id, daily_plans.date],
      set: {
        workout_plan: row.workout_plan ?? sql`excluded.workout_plan`,
        meal_plan: row.meal_plan ?? sql`excluded.meal_plan`,
        notes: row.notes ?? sql`excluded.notes`,
        updated_at: new Date(),
      },
    })
    .returning();
  return p;
}

// Toggle a "done" mark on one item in either workout_plan or meal_plan
// for a given date. Stored on daily_plans.completion as
// { workout_done: number[], meal_done: number[] }. Indices are positions
// within the corresponding plan array. Idempotent — toggling a checked
// item unchecks it.
export async function togglePlanItemDone(opts: {
  user_id: UserId;
  date: string;
  kind: "workout" | "meal";
  index: number;
  done: boolean;
}) {
  const existing = await getDailyPlan(opts.user_id, opts.date);
  const completion =
    (existing?.completion as
      | { workout_done?: number[]; meal_done?: number[] }
      | null) ?? {};
  const key = opts.kind === "workout" ? "workout_done" : "meal_done";
  const current = new Set(completion[key] ?? []);
  if (opts.done) current.add(opts.index);
  else current.delete(opts.index);
  const nextCompletion = {
    ...completion,
    [key]: Array.from(current).sort((a, b) => a - b),
  };
  const [row] = await db
    .insert(daily_plans)
    .values({
      user_id: opts.user_id,
      date: opts.date,
      completion: nextCompletion,
    })
    .onConflictDoUpdate({
      target: [daily_plans.user_id, daily_plans.date],
      set: { completion: nextCompletion, updated_at: new Date() },
    })
    .returning();
  return row;
}

export async function setWorkoutPaused(
  userId: UserId,
  date: string,
  paused: boolean,
) {
  const [p] = await db
    .insert(daily_plans)
    .values({ user_id: userId, date, workout_paused: paused })
    .onConflictDoUpdate({
      target: [daily_plans.user_id, daily_plans.date],
      set: { workout_paused: paused, updated_at: new Date() },
    })
    .returning();
  return p;
}

export async function getDailyPlansBetween(
  userId: UserId,
  startDate: string,
  endDate: string,
) {
  return db
    .select()
    .from(daily_plans)
    .where(
      and(
        eq(daily_plans.user_id, userId),
        gte(daily_plans.date, startDate),
        lt(daily_plans.date, endDate),
      ),
    )
    .orderBy(daily_plans.date);
}

// ===== Agent memory =====
export async function upsertAgentMemory(row: NewAgentMemory) {
  const [m] = await db
    .insert(agent_memory)
    .values(row)
    .onConflictDoUpdate({
      target: [agent_memory.user_id, agent_memory.agent_type, agent_memory.key],
      set: {
        value: row.value,
        expires_at: row.expires_at ?? null,
        updated_at: new Date(),
      },
    })
    .returning();
  return m;
}

export async function getAgentMemory(
  userId: UserId,
  agentType: AgentType,
  limit = 20,
) {
  return db
    .select()
    .from(agent_memory)
    .where(
      and(
        eq(agent_memory.user_id, userId),
        sql`${agent_memory.agent_type} IN (${agentType}, 'shared')`,
      ),
    )
    .orderBy(desc(agent_memory.updated_at))
    .limit(limit);
}

// ===== Conversation archival =====
// Find all (user_id, isoYear, isoWeek) groupings of conversations older than
// `cutoffDate` so a cron can summarize them into agent_memory and delete
// the originals. Returns {user_id, year, week, count} buckets.
export async function getArchivableConversationWeeks(cutoffDate: Date) {
  return db
    .select({
      user_id: conversations.user_id,
      year: sql<number>`extract(isoyear from ${conversations.created_at})::int`,
      week: sql<number>`extract(week from ${conversations.created_at})::int`,
      count: sql<number>`count(*)::int`,
      earliest: sql<Date>`min(${conversations.created_at})`,
    })
    .from(conversations)
    .where(lt(conversations.created_at, cutoffDate))
    .groupBy(
      conversations.user_id,
      sql`extract(isoyear from ${conversations.created_at})`,
      sql`extract(week from ${conversations.created_at})`,
    );
}

export async function getConversationsForWeek(
  userId: UserId,
  isoYear: number,
  isoWeek: number,
) {
  return db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.user_id, userId),
        sql`extract(isoyear from ${conversations.created_at}) = ${isoYear}`,
        sql`extract(week from ${conversations.created_at}) = ${isoWeek}`,
      ),
    )
    .orderBy(conversations.created_at);
}

export async function deleteConversationsForWeek(
  userId: UserId,
  isoYear: number,
  isoWeek: number,
) {
  const rows = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.user_id, userId),
        sql`extract(isoyear from ${conversations.created_at}) = ${isoYear}`,
        sql`extract(week from ${conversations.created_at}) = ${isoWeek}`,
      ),
    )
    .returning({ id: conversations.id });
  return rows.length;
}

export async function getMonthlyGoals(userId: UserId, monthYYYYMM: string) {
  const prefix = `goal_month_${monthYYYYMM}_%`;
  return db
    .select()
    .from(agent_memory)
    .where(
      and(
        eq(agent_memory.user_id, userId),
        ilike(agent_memory.key, prefix),
      ),
    )
    .orderBy(desc(agent_memory.updated_at));
}

// ===== Conversations =====
export async function appendConversation(row: NewConversation) {
  const [c] = await db.insert(conversations).values(row).returning();
  return c;
}

export async function getConversationHistory(
  userId: UserId,
  agentType: AgentType,
  limit = 20,
) {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.user_id, userId),
        eq(conversations.agent_type, agentType),
      ),
    )
    .orderBy(desc(conversations.created_at))
    .limit(limit);
  return rows.reverse();
}

// Cross-agent history for the unified coach. Pulls the user's last N
// conversation turns regardless of which agent_type they were filed
// under, so old per-specialist turns (trainer, meal_designer, …) still
// flow into the coach's short-term context after the migration. Tool
// rows are skipped — only user/assistant pairs are useful for the LLM.
export async function getCoachConversationHistory(
  userId: UserId,
  limit = 10,
) {
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.user_id, userId),
        inArray(conversations.role, ["user", "assistant"]),
      ),
    )
    .orderBy(desc(conversations.created_at))
    .limit(limit);
  return rows.reverse();
}

// ===== Daily logs (weight, mood) =====
export async function upsertDailyLog(row: {
  user_id: UserId;
  date: string; // YYYY-MM-DD
  weight_kg?: number | null;
  sleep_hours?: number | null;
  mood?: string | null;
  energy?: number | null;
  notes?: string | null;
}) {
  const [r] = await db
    .insert(daily_logs)
    .values(row)
    .onConflictDoUpdate({
      target: [daily_logs.user_id, daily_logs.date],
      set: {
        weight_kg: row.weight_kg ?? sql`excluded.weight_kg`,
        sleep_hours: row.sleep_hours ?? sql`excluded.sleep_hours`,
        mood: row.mood ?? sql`excluded.mood`,
        energy: row.energy ?? sql`excluded.energy`,
        notes: row.notes ?? sql`excluded.notes`,
      },
    })
    .returning();
  return r;
}

export async function getLatestWeightLog(userId: UserId) {
  const [r] = await db
    .select()
    .from(daily_logs)
    .where(
      and(
        eq(daily_logs.user_id, userId),
        sql`${daily_logs.weight_kg} IS NOT NULL`,
      ),
    )
    .orderBy(desc(daily_logs.date))
    .limit(1);
  return r ?? null;
}

export async function getRecentDailyLogs(userId: UserId, days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db
    .select()
    .from(daily_logs)
    .where(
      and(
        eq(daily_logs.user_id, userId),
        gte(daily_logs.date, since.toISOString().slice(0, 10)),
      ),
    )
    .orderBy(desc(daily_logs.date));
}

// ===== Morning reports =====
export async function getMorningReport(userId: UserId, date: string) {
  const [r] = await db
    .select()
    .from(morning_reports)
    .where(
      and(eq(morning_reports.user_id, userId), eq(morning_reports.date, date)),
    );
  return r ?? null;
}

export async function upsertMorningReport(
  userId: UserId,
  date: string,
  summaryMd: string,
  questions: unknown,
) {
  const [r] = await db
    .insert(morning_reports)
    .values({ user_id: userId, date, summary_md: summaryMd, questions })
    .onConflictDoUpdate({
      target: [morning_reports.user_id, morning_reports.date],
      set: {
        summary_md: summaryMd,
        questions,
        sent_at: new Date(),
      },
    })
    .returning();
  return r;
}

// ===== Couple snapshot =====
// Fetches both users + the slice of activity data the Couple view shows in
// one round. Returns null per-user if that user doesn't exist (we built
// for 2 hardcoded users but this stays defensive).
export async function getCoupleSnapshot(opts: {
  todayDate: string; // "YYYY-MM-DD" (Asia/Bangkok)
  weekStartDate: string; // YYYY-MM-DD, the Sunday or Monday of this week
  weekEndDateExclusive: string; // YYYY-MM-DD, weekStart + 7
}) {
  const ids = ["garfield", "partner"] as const;

  // Today macros per user
  const today = await db
    .select({
      user_id: meals.user_id,
      kcal: sql<number>`coalesce(sum(${meals.kcal}), 0)::int`,
    })
    .from(meals)
    .where(
      and(
        sql`(((${meals.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date = ${opts.todayDate}`,
        sql`${meals.user_id} IN ('garfield', 'partner')`,
      ),
    )
    .groupBy(meals.user_id);

  // Latest weight per user
  const latestWeights = await db
    .select({
      user_id: daily_logs.user_id,
      date: daily_logs.date,
      weight_kg: daily_logs.weight_kg,
    })
    .from(daily_logs)
    .where(
      and(
        sql`${daily_logs.user_id} IN ('garfield', 'partner')`,
        sql`${daily_logs.weight_kg} IS NOT NULL`,
      ),
    )
    .orderBy(desc(daily_logs.date));

  // Workout days (distinct date) within week per user
  const weekWorkoutDays = await db
    .select({
      user_id: workouts.user_id,
      d: sql<string>`(((${workouts.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`,
    })
    .from(workouts)
    .where(
      and(
        sql`${workouts.user_id} IN ('garfield', 'partner')`,
        sql`(((${workouts.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date >= ${opts.weekStartDate}::date`,
        sql`(((${workouts.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date < ${opts.weekEndDateExclusive}::date`,
      ),
    )
    .groupBy(
      workouts.user_id,
      sql`(((${workouts.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`,
    );

  const userRows = await db
    .select()
    .from(users)
    .where(sql`${users.id} IN ('garfield', 'partner')`);

  const userById = new Map(userRows.map((u) => [u.id, u]));
  const todayKcalById = new Map(today.map((r) => [r.user_id, r.kcal]));
  const latestWeightById = new Map<string, { date: string; weight_kg: number }>();
  for (const w of latestWeights) {
    if (!latestWeightById.has(w.user_id) && w.weight_kg !== null) {
      latestWeightById.set(w.user_id, { date: w.date, weight_kg: w.weight_kg });
    }
  }
  const workoutDaysById = new Map<string, Set<string>>();
  for (const w of weekWorkoutDays) {
    if (!workoutDaysById.has(w.user_id)) workoutDaysById.set(w.user_id, new Set());
    workoutDaysById.get(w.user_id)!.add(w.d);
  }

  return ids.map((id) => ({
    id,
    user: userById.get(id) ?? null,
    today_kcal: todayKcalById.get(id) ?? 0,
    latest_weight: latestWeightById.get(id) ?? null,
    week_workout_days: Array.from(workoutDaysById.get(id) ?? []).sort(),
  }));
}

// ===== Account reset =====
// Clears all activity data for one user. Keeps the users row (profile/goals)
// and llm_calls (telemetry / cost tracking). Set { wipeUserRow: true } to
// also delete the user identity itself — used by the migration that drops
// the legacy test user.
export async function resetUserData(
  userId: UserId,
  opts: { wipeUserRow?: boolean } = {},
) {
  // Order matters only insofar as nothing FK-references anything but users.
  const counts = {
    meals: 0,
    workouts: 0,
    daily_logs: 0,
    daily_plans: 0,
    agent_memory: 0,
    conversations: 0,
    morning_reports: 0,
    meal_library: 0,
    pending_plans: 0,
    user_row_deleted: false,
  };

  const r1 = await db.delete(meals).where(eq(meals.user_id, userId)).returning({ id: meals.id });
  counts.meals = r1.length;
  const r2 = await db.delete(workouts).where(eq(workouts.user_id, userId)).returning({ id: workouts.id });
  counts.workouts = r2.length;
  const r3 = await db.delete(daily_logs).where(eq(daily_logs.user_id, userId)).returning({ id: daily_logs.id });
  counts.daily_logs = r3.length;
  const r4 = await db.delete(daily_plans).where(eq(daily_plans.user_id, userId)).returning({ id: daily_plans.id });
  counts.daily_plans = r4.length;
  const r5 = await db.delete(agent_memory).where(eq(agent_memory.user_id, userId)).returning({ id: agent_memory.id });
  counts.agent_memory = r5.length;
  const r6 = await db.delete(conversations).where(eq(conversations.user_id, userId)).returning({ id: conversations.id });
  counts.conversations = r6.length;
  const r7 = await db.delete(morning_reports).where(eq(morning_reports.user_id, userId)).returning({ id: morning_reports.id });
  counts.morning_reports = r7.length;
  const r8 = await db.delete(meal_library).where(eq(meal_library.user_id, userId)).returning({ id: meal_library.id });
  counts.meal_library = r8.length;
  const r9 = await db.delete(pending_plans).where(eq(pending_plans.user_id, userId)).returning({ id: pending_plans.id });
  counts.pending_plans = r9.length;

  if (opts.wipeUserRow) {
    const r10 = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id });
    counts.user_row_deleted = r10.length > 0;
  }

  return counts;
}

// ===== Aggregates =====
export async function getDayMacros(userId: UserId, dayStart: Date, dayEnd: Date) {
  const rows = await db
    .select({
      kcal: sql<number>`coalesce(sum(${meals.kcal}), 0)::int`,
      protein_g: sql<number>`coalesce(sum(${meals.protein_g}), 0)::float`,
      carb_g: sql<number>`coalesce(sum(${meals.carb_g}), 0)::float`,
      fat_g: sql<number>`coalesce(sum(${meals.fat_g}), 0)::float`,
    })
    .from(meals)
    .where(
      and(
        eq(meals.user_id, userId),
        gte(meals.datetime, dayStart),
        lt(meals.datetime, dayEnd),
      ),
    );
  return rows[0] ?? { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 };
}

// ===== History summaries (pre-aggregated, for LLM context efficiency) =====

// Day expression: interpret meal/workout timestamp as UTC, convert to Bangkok wall-clock, take date.
const bkkDayMeals = sql<string>`(((${meals.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`;
const bkkDayWorkouts = sql<string>`(((${workouts.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`;

export async function getDailyMacroSummary(userId: UserId, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db
    .select({
      date: bkkDayMeals,
      kcal: sql<number>`coalesce(sum(${meals.kcal}), 0)::int`,
      protein_g: sql<number>`coalesce(sum(${meals.protein_g}), 0)::float`,
      carb_g: sql<number>`coalesce(sum(${meals.carb_g}), 0)::float`,
      fat_g: sql<number>`coalesce(sum(${meals.fat_g}), 0)::float`,
      meal_count: sql<number>`count(*)::int`,
    })
    .from(meals)
    .where(and(eq(meals.user_id, userId), gte(meals.datetime, since)))
    .groupBy(bkkDayMeals)
    .orderBy(sql`1 desc`);
}

export async function getWorkoutSummary(userId: UserId, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const exerciseKey = sql<string>`lower(${workouts.exercise})`;
  return db
    .select({
      exercise: exerciseKey,
      sessions: sql<number>`count(*)::int`,
      total_sets: sql<number>`coalesce(sum(${workouts.sets}), 0)::int`,
      total_reps: sql<number>`coalesce(sum(${workouts.sets} * ${workouts.reps}), 0)::int`,
      total_volume_kg: sql<number>`coalesce(sum(${workouts.sets} * ${workouts.reps} * ${workouts.weight_kg}), 0)::float`,
      max_weight_kg: sql<number | null>`max(${workouts.weight_kg})`,
      total_duration_min: sql<number>`coalesce(sum(${workouts.duration_min}), 0)::int`,
      last_done: sql<string>`to_char(max(${workouts.datetime}) AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')`,
    })
    .from(workouts)
    .where(and(eq(workouts.user_id, userId), gte(workouts.datetime, since)))
    .groupBy(exerciseKey)
    .orderBy(sql`max(${workouts.datetime}) desc`);
}

export async function getWorkoutDailyVolume(userId: UserId, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  return db
    .select({
      date: bkkDayWorkouts,
      sessions: sql<number>`count(*)::int`,
      total_sets: sql<number>`coalesce(sum(${workouts.sets}), 0)::int`,
      total_volume_kg: sql<number>`coalesce(sum(${workouts.sets} * ${workouts.reps} * ${workouts.weight_kg}), 0)::float`,
      total_duration_min: sql<number>`coalesce(sum(${workouts.duration_min}), 0)::int`,
    })
    .from(workouts)
    .where(and(eq(workouts.user_id, userId), gte(workouts.datetime, since)))
    .groupBy(bkkDayWorkouts)
    .orderBy(sql`1 desc`);
}

export async function getWeightSeries(userId: UserId, days: number) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);
  return db
    .select({ date: daily_logs.date, weight_kg: daily_logs.weight_kg })
    .from(daily_logs)
    .where(
      and(
        eq(daily_logs.user_id, userId),
        gte(daily_logs.date, sinceDate),
        sql`${daily_logs.weight_kg} IS NOT NULL`,
      ),
    )
    .orderBy(daily_logs.date);
}

export async function pruneExpiredAgentMemory() {
  const rows = await db
    .delete(agent_memory)
    .where(sql`${agent_memory.expires_at} IS NOT NULL AND ${agent_memory.expires_at} < now()`)
    .returning({ id: agent_memory.id });
  return rows.length;
}

// ===== Meal library =====
// Library is shared across all users in this couples app — both garfield
// and partner see/use the same meals. The user_id column on meal_library
// is preserved as an audit trail (whichever user first saved a given
// dish), but it's intentionally NOT part of read or upsert lookups, so a
// meal saved by either side is visible to both. The userId param on
// listMealLibrary/findMealLibraryByName/bumpMealLibraryUsage is kept for
// signature compatibility with existing callers but is not used in WHERE
// clauses.
export async function listMealLibrary(_userId: UserId, limit = 50) {
  return db
    .select()
    .from(meal_library)
    .orderBy(desc(meal_library.last_used_at), desc(meal_library.times_used))
    .limit(limit);
}

export async function findMealLibraryByName(
  _userId: UserId,
  query: string,
  limit = 10,
) {
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  return db
    .select()
    .from(meal_library)
    .where(
      or(
        ilike(meal_library.name, pattern),
        ilike(sql`${meal_library.notes}`, pattern),
      ),
    )
    .orderBy(desc(meal_library.last_used_at), desc(meal_library.times_used))
    .limit(limit);
}

export async function upsertMealLibraryEntry(row: NewMealLibraryEntry) {
  // Case-insensitive name match across the entire library (no per-user
  // partition). If both users try to save "ข้าวไก่" they collapse into one
  // shared row instead of two siloed ones — which is what couples-app
  // semantics call for. The first-saver's user_id stays on the row as
  // audit; subsequent updates don't overwrite it.
  const [existing] = await db
    .select()
    .from(meal_library)
    .where(sql`lower(${meal_library.name}) = lower(${row.name})`)
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(meal_library)
      .set({
        meal_type: row.meal_type ?? existing.meal_type,
        kcal: row.kcal,
        protein_g: row.protein_g,
        carb_g: row.carb_g,
        fat_g: row.fat_g,
        prep_min: row.prep_min ?? existing.prep_min,
        ingredients: row.ingredients ?? existing.ingredients,
        recipe: row.recipe ?? existing.recipe,
        notes: row.notes ?? existing.notes,
        updated_at: new Date(),
      })
      .where(eq(meal_library.id, existing.id))
      .returning();
    return updated;
  }
  const [inserted] = await db.insert(meal_library).values(row).returning();
  return inserted;
}

export async function bumpMealLibraryUsage(_userId: UserId, name: string) {
  await db
    .update(meal_library)
    .set({
      times_used: sql`${meal_library.times_used} + 1`,
      last_used_at: new Date(),
      updated_at: new Date(),
    })
    .where(sql`lower(${meal_library.name}) = lower(${name})`);
}

// ===== Pending (draft) plans =====
export async function insertPendingPlan(row: NewPendingPlan) {
  const [p] = await db.insert(pending_plans).values(row).returning();
  return p;
}

export async function getActivePendingPlans(userId: UserId) {
  return db
    .select()
    .from(pending_plans)
    .where(
      and(eq(pending_plans.user_id, userId), eq(pending_plans.status, "pending")),
    )
    .orderBy(desc(pending_plans.proposed_at));
}

export async function getPendingPlan(id: string, userId: UserId) {
  const [p] = await db
    .select()
    .from(pending_plans)
    .where(and(eq(pending_plans.id, id), eq(pending_plans.user_id, userId)));
  return p ?? null;
}

export async function rejectPendingPlan(id: string, userId: UserId) {
  const [p] = await db
    .update(pending_plans)
    .set({ status: "rejected", decided_at: new Date() })
    .where(and(eq(pending_plans.id, id), eq(pending_plans.user_id, userId)))
    .returning();
  return p ?? null;
}

export async function approvePendingPlan(id: string, userId: UserId) {
  const pending = await getPendingPlan(id, userId);
  if (!pending) return { ok: false as const, reason: "not_found" };
  if (pending.status !== "pending") {
    return { ok: false as const, reason: `already_${pending.status}` };
  }
  const days = (pending.plans as PendingPlanDay[]) ?? [];
  await upsertDailyPlansBulk(
    days.map((d) => ({
      user_id: userId,
      date: d.date,
      workout_plan: d.workout_plan ?? null,
      meal_plan: d.meal_plan ?? null,
      notes: d.notes ?? null,
    })),
  );
  await db
    .update(pending_plans)
    .set({ status: "approved", decided_at: new Date() })
    .where(eq(pending_plans.id, id));
  return { ok: true as const, count: days.length };
}

// ===== Bulk plan upsert =====
export async function upsertDailyPlansBulk(rows: NewDailyPlan[]) {
  if (rows.length === 0) return [];
  // Sequential upserts (Drizzle pg doesn't expose multi-row onConflict cleanly here)
  const out: Awaited<ReturnType<typeof upsertDailyPlan>>[] = [];
  for (const r of rows) {
    out.push(await upsertDailyPlan(r));
  }
  return out;
}

// ===== Memory search =====
export async function searchAgentMemory(
  userId: UserId,
  query: string,
  limit = 10,
) {
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
  const pattern = `%${escaped}%`;
  return db
    .select()
    .from(agent_memory)
    .where(
      and(
        eq(agent_memory.user_id, userId),
        or(
          ilike(agent_memory.value, pattern),
          ilike(agent_memory.key, pattern),
        ),
      ),
    )
    .orderBy(desc(agent_memory.updated_at))
    .limit(limit);
}

export type AnyMealType = MealType;
