import { formatInTimeZone } from "date-fns-tz";
import {
  getDailyPlan,
  getMealsSince,
  getMonthlyGoals,
  getMorningReport,
  getRecentDailyLogs,
  getUser,
  getWorkoutsSince,
  upsertMorningReport,
} from "@/lib/db/queries";
import { asWorkoutArray } from "@/lib/plan-types";
import type { UserId } from "@/lib/db/schema";
import { callLLM } from "./client";
import { TZ } from "./runtime";
import { REPORTER_PROMPT } from "./prompts";

export interface ReportResult {
  userId: UserId;
  date: string;
  summary: string;
}

export async function generateMorningReport(userId: UserId): Promise<ReportResult> {
  const user = await getUser(userId);
  if (!user) throw new Error(`unknown user: ${userId}`);

  const now = new Date();
  const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const yesterday = formatInTimeZone(new Date(now.getTime() - 24 * 60 * 60 * 1000), TZ, "yyyy-MM-dd");
  const yesterdayStart = new Date(now.getTime() - 36 * 60 * 60 * 1000);
  const monthYYYYMM = formatInTimeZone(now, TZ, "yyyyMM");

  const [meals, workouts, weights, todayPlan, yesterdayPlan, monthlyGoals] = await Promise.all([
    getMealsSince(userId, yesterdayStart),
    getWorkoutsSince(userId, yesterdayStart),
    getRecentDailyLogs(userId, 7),
    getDailyPlan(userId, today),
    getDailyPlan(userId, yesterday).catch(() => null),
    getMonthlyGoals(userId, monthYYYYMM).catch(() => []),
  ]);

  const totals = meals.reduce(
    (a, m) => ({
      kcal: a.kcal + m.kcal,
      protein: a.protein + m.protein_g,
      carb: a.carb + m.carb_g,
      fat: a.fat + m.fat_g,
    }),
    { kcal: 0, protein: 0, carb: 0, fat: 0 },
  );

  const fmtMeals = meals.length
    ? meals
        .map(
          (m) =>
            `- ${formatInTimeZone(m.datetime, TZ, "MM-dd HH:mm")} ${m.meal_type} ${m.food_name} ${m.kcal}kcal P${Math.round(m.protein_g)}g`,
        )
        .join("\n")
    : "(ไม่มี)";

  const fmtWorkouts = workouts.length
    ? workouts
        .map(
          (w) =>
            `- ${formatInTimeZone(w.datetime, TZ, "MM-dd HH:mm")} ${w.exercise} ${w.sets ?? "?"}x${w.reps ?? "?"}${w.weight_kg ? ` @${w.weight_kg}kg` : ""}${w.duration_min ? ` ${w.duration_min}min` : ""}`,
        )
        .join("\n")
    : "(ไม่มี)";

  const fmtWeights = weights.length
    ? weights
        .filter((w) => w.weight_kg !== null)
        .slice(0, 7)
        .map((w) => `- ${w.date}: ${w.weight_kg}kg`)
        .join("\n") || "(ไม่มี)"
    : "(ไม่มี)";

  const workoutPaused = todayPlan?.workout_paused === true;
  const planForPrompt = todayPlan
    ? {
        workout: workoutPaused ? "(หยุด workout วันนี้ตามที่ผู้ใช้ตั้งไว้ — ห้ามเตือนหรือเสนอ workout)" : todayPlan.workout_plan,
        meals: todayPlan.meal_plan,
        notes: todayPlan.notes,
      }
    : null;

  // #3d — rebalance-on-miss signal: did yesterday have a planned workout that wasn't logged?
  const yesterdayPlannedWorkouts = asWorkoutArray(yesterdayPlan?.workout_plan);
  const yesterdayPaused = yesterdayPlan?.workout_paused === true;
  const yesterdayWorkoutsLogged = workouts.filter((w) => {
    const wDate = formatInTimeZone(w.datetime, TZ, "yyyy-MM-dd");
    return wDate === yesterday;
  });
  const missedWorkoutBlock =
    yesterdayPlannedWorkouts.length > 0 &&
    !yesterdayPaused &&
    yesterdayWorkoutsLogged.length === 0
      ? `\nแผน workout เมื่อวาน (${yesterday}) ที่ไม่ได้บันทึก:\n${yesterdayPlannedWorkouts
          .map(
            (w) =>
              `- ${w.exercise}${w.sets ? ` ${w.sets}x${w.reps ?? "?"}` : ""}${w.weight_kg ? ` @${w.weight_kg}kg` : ""}`,
          )
          .join("\n")}\n→ ในส่วน "คำถามเช้านี้" ให้ถาม user ว่าอยากย้ายมาวันนี้, ดันไปพรุ่งนี้, หรือข้าม\n`
      : "";

  // #3c — monthly structural goals (from agent_memory key prefix goal_month_YYYYMM_*)
  const monthlyGoalBlock = monthlyGoals.length
    ? `\nเป้าหมายระดับเดือนนี้ (${monthYYYYMM}):\n${monthlyGoals
        .map((g) => `- [${g.key.replace(`goal_month_${monthYYYYMM}_`, "")}] ${g.value}`)
        .join("\n")}\n→ พิจารณาด้วยว่า user เดินไปทาง goal เหล่านี้แค่ไหน และแทรกใน "สรุป" ถ้าเกี่ยวข้อง\n`
    : "";

  const userMessage = `สรุปข้อมูล 24-36 ชม.ที่ผ่านมาของ ${user.name}:

มื้ออาหาร (รวม ${totals.kcal}kcal, P${Math.round(totals.protein)}/C${Math.round(totals.carb)}/F${Math.round(totals.fat)}g):
${fmtMeals}

ออกกำลังกาย:
${fmtWorkouts}

น้ำหนักล่าสุด (7 วัน):
${fmtWeights}

แผนวันนี้ (${today}):
${planForPrompt ? JSON.stringify(planForPrompt, null, 2) : "(ไม่มี)"}
${workoutPaused ? "\nหมายเหตุ: ผู้ใช้กดหยุด workout วันนี้ — ในส่วน 'แผนวันนี้' ของรายงาน ให้บอกแค่เรื่องอาหาร/พักผ่อน อย่าเสนอ workout เพิ่ม\n" : ""}${missedWorkoutBlock}${monthlyGoalBlock}
เป้าหมาย:
- daily ${user.goal_kcal ?? "-"} kcal, P ${user.goal_protein_g ?? "-"}g
- ${user.goal}

สรุปและตั้งคำถามเช้านี้ให้หน่อย`;

  const res = await callLLM({
    tier: "kimi",
    systemInstruction: REPORTER_PROMPT,
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    agent: "reporter",
    userId,
  });

  const summary = (res.text ?? "").trim() || "(ไม่มีสรุป)";

  await upsertMorningReport(userId, today, summary, null);

  return { userId, date: today, summary };
}

export async function getOrGenerateMorningReport(userId: UserId) {
  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const existing = await getMorningReport(userId, today).catch(() => null);
  if (existing) return existing;
  const generated = await generateMorningReport(userId);
  return getMorningReport(userId, generated.date);
}
