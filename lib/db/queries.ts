import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "./client";
import {
  agent_memory,
  conversations,
  daily_logs,
  daily_plans,
  meals,
  morning_reports,
  users,
  workouts,
  type AgentType,
  type MealType,
  type NewAgentMemory,
  type NewConversation,
  type NewDailyPlan,
  type NewMeal,
  type NewWorkout,
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

// ===== Daily logs (weight, mood) =====
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

export type AnyMealType = MealType;
