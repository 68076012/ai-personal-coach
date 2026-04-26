import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import {
  getDailyPlan,
  getMealsSince,
  getMorningReport,
  getRecentDailyLogs,
  getUser,
  getWorkoutsSince,
} from "@/lib/db/queries";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { MorningTakeover } from "@/components/dashboard/morning-takeover";
import type { UserId } from "@/lib/db/schema";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

export default async function MorningTakeoverPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const now = new Date();
  const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const since = new Date(now.getTime() - 36 * 60 * 60 * 1000);

  const [user, report, meals, workouts, weights, plan, lang] = await Promise.all([
    getUser(userId),
    getMorningReport(userId, today).catch(() => null),
    getMealsSince(userId, since).catch(() => []),
    getWorkoutsSince(userId, since).catch(() => []),
    getRecentDailyLogs(userId, 7).catch(() => []),
    getDailyPlan(userId, today).catch(() => null),
    getLang(),
  ]);

  if (!user) return null;

  const yesterdayKcal = meals.reduce((s, m) => s + m.kcal, 0);
  const yesterdayWorkoutCount = workouts.length;
  const latestWeight = weights.find((w) => w.weight_kg !== null);

  // Streak count: consecutive days from today back with at least one log
  const loggedDates = new Set([
    ...meals.map((m) => formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd")),
    ...workouts.map((w) => formatInTimeZone(w.datetime, TZ, "yyyy-MM-dd")),
  ]);
  let streak = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = formatInTimeZone(d, TZ, "yyyy-MM-dd");
    if (loggedDates.has(key)) streak++;
    else break;
  }

  const summary =
    report?.summary_md ?? (lang === "th"
      ? "วันใหม่กำลังเริ่ม — ลองตั้งใจกินดีและขยับสักนิด"
      : "A fresh day is here — eat well and move a little");
  const summaryFirstPara = (summary.split(/\n\n/)[0] || summary).slice(0, 220);

  // Today plan summary
  const todayWorkout = (plan?.workout_plan as Array<{ exercise?: string }> | null)?.length ?? 0;
  const todayMeals = (plan?.meal_plan as Array<{ name?: string }> | null)?.length ?? 0;

  const slides = [
    {
      kind: "hello" as const,
      title: lang === "th" ? "ขอเริ่มต้นวันด้วยกัน" : "Let's start the day",
    },
    {
      kind: "recap" as const,
      title: lang === "th"
        ? `เมื่อวานบันทึก ${meals.length} มื้อ${yesterdayWorkoutCount > 0 ? ` + ${yesterdayWorkoutCount} workout` : ""}`
        : `Yesterday: ${meals.length} meals${yesterdayWorkoutCount > 0 ? ` + ${yesterdayWorkoutCount} workout` : ""}`,
      body: summaryFirstPara,
      metric: yesterdayKcal > 0 ? {
        label: t("kcal_short", lang),
        value: yesterdayKcal.toLocaleString(),
      } : undefined,
    },
    {
      kind: "streak" as const,
      title: streak > 0
        ? lang === "th"
          ? `${streak} วันต่อเนื่อง`
          : `${streak}-day streak`
        : lang === "th"
          ? "เริ่ม streak ใหม่วันนี้"
          : "Fresh streak starts today",
      body: latestWeight
        ? lang === "th"
          ? `น้ำหนักล่าสุด ${latestWeight.weight_kg}kg`
          : `Latest weight ${latestWeight.weight_kg}kg`
        : undefined,
      metric: streak > 0 ? {
        label: t("days", lang),
        value: streak.toString(),
      } : undefined,
    },
    {
      kind: "today" as const,
      title: lang === "th" ? "วันนี้มีอะไรรอ" : "What's on for today",
      body:
        todayWorkout + todayMeals > 0
          ? lang === "th"
            ? `${todayMeals} มื้อ + ${todayWorkout} workout ในแผน — แตะ Plan เพื่อดูรายละเอียด`
            : `${todayMeals} meals + ${todayWorkout} workout planned — open Plan for details`
          : lang === "th"
            ? "ยังไม่มีแผน — ถามโค้ชให้ช่วยวางได้เลย"
            : "No plan yet — ask the coach to lay one out",
    },
  ];

  return (
    <MorningTakeover lang={lang} userName={user.name} slides={slides} />
  );
}
