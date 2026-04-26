import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import {
  getDailyPlan,
  getDayMacros,
  getMealsSince,
  getMorningReport,
  getRecentMeals,
  getRecentWorkouts,
  getUser,
} from "@/lib/db/queries";
import { getLang } from "@/lib/i18n/server";
import { HiFiDashboard } from "@/components/dashboard/hifi-dashboard";
import type { Meal, MealType, UserId } from "@/lib/db/schema";
import { db, schema } from "@/lib/db/client";
import { and, desc, eq, sql } from "drizzle-orm";

function expectedMealType(hourBkk: number): MealType {
  if (hourBkk < 10) return "breakfast";
  if (hourBkk < 14) return "lunch";
  if (hourBkk < 17) return "snack";
  return "dinner";
}

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

// Cheap streak calc: count distinct days going back from today where the
// user has at least one meal logged. Stops at first gap. Capped at 60 to
// keep the query bounded.
async function getMealStreak(userId: UserId): Promise<number> {
  try {
    const rows = await db
      .select({
        d: sql<string>`(((${schema.meals.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`,
      })
      .from(schema.meals)
      .where(eq(schema.meals.user_id, userId))
      .groupBy(sql`(((${schema.meals.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`)
      .orderBy(desc(sql`(((${schema.meals.datetime}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date`))
      .limit(60);
    if (rows.length === 0) return 0;
    // Walk backward from today; expect today, today-1, ...
    const todayBkk = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
    const set = new Set(rows.map((r) => r.d));
    let streak = 0;
    let cursor = new Date(todayBkk + "T00:00:00+07:00");
    for (let i = 0; i < 60; i++) {
      const key = cursor.toISOString().slice(0, 10);
      if (set.has(key)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else {
        break;
      }
    }
    // Drop today if today has no meals — we don't want "1" to flicker before lunch.
    if (streak === 1 && !set.has(todayBkk)) return 0;
    return streak;
  } catch {
    return 0;
  }
}

// suppress unused (and is referenced via sql tag)
void and;

export default async function DashboardHome() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const now = new Date();
  const todayDate = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const hourBkk = parseInt(formatInTimeZone(now, TZ, "H"), 10);
  const dayStart = new Date(`${todayDate}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Yesterday window in Bangkok tz, used to find a "Repeat yesterday's
  // <meal>" candidate for the dashboard suggestion strip.
  const yStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);

  const [user, plan, macros, meals, workouts, report, lang, streak, yesterdayMeals] = await Promise.all([
    getUser(userId).catch(() => null),
    getDailyPlan(userId, todayDate).catch(() => null),
    getDayMacros(userId, dayStart, dayEnd).catch(() => ({
      kcal: 0,
      protein_g: 0,
      carb_g: 0,
      fat_g: 0,
    })),
    getRecentMeals(userId, 8).catch(() => []),
    getRecentWorkouts(userId, 8).catch(() => []),
    getMorningReport(userId, todayDate).catch(() => null),
    getLang(),
    getMealStreak(userId),
    getMealsSince(userId, yStart).catch(() => [] as Meal[]),
  ]);

  // Repeat-candidate: most recent meal from yesterday whose meal_type
  // matches what we'd expect at the current Bangkok hour (breakfast in
  // the morning, lunch midday, etc.). Falls through to nothing if user
  // already logged that slot today (we don't want to nag them).
  const wantType = expectedMealType(hourBkk);
  const todayHasType = meals.some((m) => {
    const d = formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd");
    return d === todayDate && m.meal_type === wantType;
  });
  const repeatCandidate: Meal | null = todayHasType
    ? null
    : (yesterdayMeals.find((m) => {
        const d = formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd");
        return d !== todayDate && m.meal_type === wantType;
      }) ?? null);

  if (!user) {
    return (
      <main className="px-4 py-8 text-sm text-[var(--ink-3)]">
        ยังโหลดข้อมูลไม่ได้ — เช็ค DATABASE_URL
      </main>
    );
  }

  return (
    <HiFiDashboard
      lang={lang}
      user={user}
      todayDate={todayDate}
      hourBkk={hourBkk}
      macros={macros}
      meals={meals}
      workouts={workouts}
      plan={plan}
      report={report}
      streakDays={streak}
      repeatCandidate={repeatCandidate}
    />
  );
}
