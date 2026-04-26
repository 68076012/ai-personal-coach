import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { callGemini } from "./client";
import { commonHeader } from "./prompts";
import { buildPromptContext, TZ } from "./runtime";
import { executeTool, logTurn } from "./tools";
import {
  MealItemSchema,
  PlanSchema,
  WorkoutItemSchema,
  type MealItem,
  type Plan,
  type WorkoutItem,
} from "@/lib/plan-types";
import type { UserId } from "@/lib/db/schema";
import type { ModelTier } from "./models";
import type { RoutedAgent } from "./orchestrator";

export type PlanSpecialist = "trainer" | "meal_designer";

export interface RunPlanSynthesisInput {
  userId: UserId;
  message: string;
  specialists: PlanSpecialist[];
  overrideTier?: ModelTier;
}

export interface RunPlanSynthesisResult {
  reply: string;
  pendingPlanId: string;
  dates: string[];
  plan: Plan;
  // Per-date plans actually persisted (same shape as propose_plan_bulk args).
  // Surfaced so the chat tool-card can render the day-by-day expander.
  plansForCard: Array<{
    date: string;
    workout_plan: unknown;
    meal_plan: unknown;
    notes: string | null;
  }>;
}

const DRAFT_TRAINER = `บทบาท (draft mode): คุณคือเทรนเนอร์ที่กำลังร่าง workout slice ของแผน
หน้าที่ตอนนี้: ส่งคืนเฉพาะ JSON array ของ workout items สำหรับ "วันที่เป้าหมาย" ที่ระบุ ไม่ใช้ tool ไม่อธิบาย ไม่ทักทาย

ข้อกำหนด workout_plan:
- 1 entry = 1 ท่า (ห้ามรวมหลายท่าใน entry เดียว)
- ใส่ sets, reps, weight_kg ถ้าเหมาะกับท่านั้น (เช่น cardio ใส่ duration_min แทน)
- ถ้า user มี sports_focus ให้ออกแบบให้ support กีฬานั้น (badminton → single-leg explosive, footwork, shoulder/ankle prehab)
- ถ้ามี memory เรื่องอาการ/อุปกรณ์ที่บ้าน ต้องเคารพ
- 4-7 ท่าต่อวัน

รูปแบบ output (เคร่งครัด — ห้ามมี text อื่นนอกจาก JSON นี้):
{
  "workout_plan": [
    { "exercise": "string", "sets": number?, "reps": number?, "weight_kg": number?, "duration_min": number?, "notes": "string?" }
  ]
}`;

const DRAFT_MEAL_DESIGNER = `บทบาท (draft mode): คุณคือ chef ที่กำลังร่าง meal slice ของแผน
หน้าที่ตอนนี้: ส่งคืนเฉพาะ JSON array ของ meals สำหรับ "วันที่เป้าหมาย" ที่ระบุ ไม่ใช้ tool ไม่อธิบาย

ข้อกำหนด meal_plan:
- 1 entry = 1 จาน (breakfast / lunch / dinner / snack แยก)
- ครอบคลุม breakfast + lunch + dinner อย่างน้อย (snack ใส่ถ้ามี)
- รวม kcal ทั้งวันต้อง close to user goal_kcal (±10%)
- เคารพ pantry_ingredients (พยายามใช้ของที่มี), dietary_notes (ของแพ้/ไม่กิน)
- 3-5 entries ต่อวัน

รูปแบบ output (เคร่งครัด — ห้ามมี text อื่นนอกจาก JSON นี้):
{
  "meal_plan": [
    { "meal_type": "breakfast"|"lunch"|"dinner"|"snack", "name": "string", "kcal": number, "protein_g": number, "carb_g": number, "fat_g": number, "prep_min": number?, "ingredients": ["string"]? }
  ]
}`;

const SYNTHESIS_PROMPT = `บทบาท: Coach orchestrator. รับร่างจาก specialists แล้วผสานเป็นแผนเดียวที่ user ใช้ได้จริง

หน้าที่:
- รวม workout_plan (จาก trainer draft) + meal_plan (จาก meal_designer draft) เป็น Plan เดียว
- ปรับให้ consistent กับ user context: goal_kcal, sports_focus, dietary_notes, pantry, today_macros (ถ้า user กินไปแล้วบางมื้อ ลด kcal ของ meal_plan ที่เหลือ)
- ถ้า trainer ไม่ส่ง workout มา (slice ว่าง) → เติม workout เบาๆ 3-4 ท่าด้วยตัวเอง
- ถ้า meal_designer ไม่ส่งมา → ออกแบบเมนูเองตาม goal
- เขียน notes สั้นๆ (1 ประโยค) อธิบาย rationale ของแผน เช่น "เน้น single-leg power สำหรับแบดมินตัน + เมนู high-protein ตาม goal 2200 kcal"

รูปแบบ output (เคร่งครัด — JSON เท่านั้น ห้ามมี markdown code fence):
{
  "plan": {
    "workout_plan": [...],
    "meal_plan": [...],
    "notes": "string"
  },
  "summary_th": "ข้อความ 1-2 บรรทัด เป็นภาษาไทย เริ่มด้วย 'ร่างแผน...ให้แล้ว' และจบด้วยการบอกให้กด Apply ใต้ข้อความนี้"
}`;

const PLAN_INTENT_RE =
  /(วางแผน|วางตาราง|จัดแผน|ออกแบบเมนู|plan(ning)?\b|schedule)/i;

export function isPlanIntent(message: string): boolean {
  return PLAN_INTENT_RE.test(message);
}

interface ResolvedDate {
  dates: string[];
  label: string;
}

export function resolveTargetDates(message: string, now: Date = new Date()): ResolvedDate {
  const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const tomorrow = formatInTimeZone(addDays(now, 1), TZ, "yyyy-MM-dd");

  if (/พรุ่งนี้|tomorrow/i.test(message)) {
    return { dates: [tomorrow], label: "พรุ่งนี้" };
  }
  if (/(\b7\s*วัน|สัปดาห์|week)/i.test(message)) {
    const dates: string[] = [];
    for (let i = 0; i < 7; i++) {
      dates.push(formatInTimeZone(addDays(now, i), TZ, "yyyy-MM-dd"));
    }
    return { dates, label: "7 วัน" };
  }
  if (/(เดือน|month|30\s*วัน)/i.test(message)) {
    const dates: string[] = [];
    for (let i = 0; i < 28; i++) {
      dates.push(formatInTimeZone(addDays(now, i), TZ, "yyyy-MM-dd"));
    }
    return { dates, label: "1 เดือน" };
  }
  return { dates: [today], label: "วันนี้" };
}

function extractJson(text: string): unknown | null {
  const trimmed = text.trim();
  // Strip optional markdown fence
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  // Find largest balanced object
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function draftWorkoutSlice(
  userId: UserId,
  message: string,
  dates: string[],
  dateLabel: string,
  overrideTier?: ModelTier,
): Promise<WorkoutItem[]> {
  const ctx = await buildPromptContext(userId, "trainer");
  const datesLine =
    dates.length === 1
      ? `วันที่เป้าหมาย: ${dates[0]} (${dateLabel})`
      : `วันที่เป้าหมาย: ${dates[0]} → ${dates[dates.length - 1]} (${dateLabel}). ออกแบบ "1 วัน representative" ที่ orchestrator จะปรับใช้กับวันอื่น`;
  const systemInstruction = `${commonHeader(ctx)}\n\n${DRAFT_TRAINER}\n\n${datesLine}`;
  try {
    const res = await callGemini({
      tier: overrideTier ?? "flash",
      systemInstruction,
      contents: [{ role: "user", parts: [{ text: message }] }],
      agent: "trainer",
      userId,
      // Drafts emit JSON from a fixed schema — no reasoning needed. Disabling
      // thinking shaves 2-5s off each call and is the difference between
      // landing inside Vercel's 60s budget and timing out.
      thinkingBudget: 0,
    });
    const parsed = extractJson(res.text ?? "");
    if (!parsed || typeof parsed !== "object") return [];
    const arr = (parsed as { workout_plan?: unknown }).workout_plan;
    if (!Array.isArray(arr)) return [];
    const validated = arr
      .map((v) => WorkoutItemSchema.safeParse(v))
      .filter((r) => r.success)
      .map((r) => r.data);
    return validated;
  } catch (err) {
    console.warn("[plan-synthesis] trainer draft failed:", err);
    return [];
  }
}

async function draftMealSlice(
  userId: UserId,
  message: string,
  dates: string[],
  dateLabel: string,
  overrideTier?: ModelTier,
): Promise<MealItem[]> {
  const ctx = await buildPromptContext(userId, "meal_designer");
  const datesLine =
    dates.length === 1
      ? `วันที่เป้าหมาย: ${dates[0]} (${dateLabel})`
      : `วันที่เป้าหมาย: ${dates[0]} → ${dates[dates.length - 1]} (${dateLabel}). ออกแบบ "1 วัน representative"`;
  const systemInstruction = `${commonHeader(ctx)}\n\n${DRAFT_MEAL_DESIGNER}\n\n${datesLine}`;
  try {
    const res = await callGemini({
      tier: overrideTier ?? "flash",
      systemInstruction,
      contents: [{ role: "user", parts: [{ text: message }] }],
      agent: "meal_designer",
      userId,
      thinkingBudget: 0,
    });
    const parsed = extractJson(res.text ?? "");
    if (!parsed || typeof parsed !== "object") return [];
    const arr = (parsed as { meal_plan?: unknown }).meal_plan;
    if (!Array.isArray(arr)) return [];
    const validated = arr
      .map((v) => MealItemSchema.safeParse(v))
      .filter((r) => r.success)
      .map((r) => r.data);
    return validated;
  } catch (err) {
    console.warn("[plan-synthesis] meal_designer draft failed:", err);
    return [];
  }
}

interface SynthesisOutput {
  plan: Plan;
  summary: string;
}

async function synthesize(
  userId: UserId,
  message: string,
  drafts: { workout: WorkoutItem[]; meals: MealItem[] },
  dateLabel: string,
  tier: ModelTier,
): Promise<SynthesisOutput> {
  const ctx = await buildPromptContext(userId, "orchestrator");
  const draftsBlock = `Trainer draft (workout):\n${JSON.stringify(drafts.workout, null, 2)}\n\nMeal Designer draft (meals):\n${JSON.stringify(drafts.meals, null, 2)}\n\nUser message: ${message}\nวันที่เป้าหมาย: ${dateLabel}`;
  const res = await callGemini({
    tier,
    systemInstruction: `${commonHeader(ctx)}\n\n${SYNTHESIS_PROMPT}`,
    contents: [{ role: "user", parts: [{ text: draftsBlock }] }],
    agent: "orchestrator",
    userId,
    // Cap reasoning so Pro/Flash 2.5 don't stall the function. Merge logic
    // is mechanical (combine slices, scale kcal, swap exercises for
    // sports_focus); 1024 thinking tokens is plenty.
    thinkingBudget: 1024,
  });
  const parsed = extractJson(res.text ?? "");
  if (!parsed || typeof parsed !== "object") {
    throw new Error("synthesis_returned_invalid_json");
  }
  const obj = parsed as { plan?: unknown; summary_th?: unknown };
  const planResult = PlanSchema.safeParse(obj.plan);
  if (!planResult.success) {
    throw new Error(`synthesis_plan_invalid: ${planResult.error.issues[0]?.message}`);
  }
  const summary =
    typeof obj.summary_th === "string" && obj.summary_th.trim().length > 0
      ? obj.summary_th.trim()
      : "ร่างแผนให้แล้ว — กด Apply ใต้ข้อความนี้เพื่อใช้แผนนี้";
  return { plan: planResult.data, summary };
}

export async function runPlanSynthesis(
  input: RunPlanSynthesisInput,
): Promise<RunPlanSynthesisResult> {
  const { userId, message, specialists, overrideTier } = input;
  const { dates, label: dateLabel } = resolveTargetDates(message);
  const wantWorkout = specialists.includes("trainer");
  const wantMeals = specialists.includes("meal_designer");

  // Persist the user message FIRST (before the slow synthesis pipeline).
  // If the user closes the tab or refreshes while synthesis is in flight,
  // the chat page still finds their question on reload + can render a
  // pending placeholder. Wrapped in try/catch so a logging hiccup doesn't
  // block the actual planning work.
  try {
    await logTurn(userId, "orchestrator", "user", message);
  } catch (err) {
    console.warn("[plan-synthesis] logTurn(user) failed:", err);
  }

  const [workout, meals] = await Promise.all([
    wantWorkout
      ? draftWorkoutSlice(userId, message, dates, dateLabel, overrideTier)
      : Promise.resolve([] as WorkoutItem[]),
    wantMeals
      ? draftMealSlice(userId, message, dates, dateLabel, overrideTier)
      : Promise.resolve([] as MealItem[]),
  ]);

  // Default to Flash for synthesis — Pro 2.5 with thinking can run 20-40s
  // and timed out the function on Vercel. Flash + capped thinkingBudget
  // produces a usable merge in 5-10s. Users can still force Pro via the
  // model selector if they want richer reasoning.
  const synthTier: ModelTier = overrideTier ?? "flash";
  const { plan, summary } = await synthesize(
    userId,
    message,
    { workout, meals },
    dateLabel,
    synthTier,
  );

  const planForPersist = {
    workout_plan: plan.workout_plan ?? null,
    meal_plan: plan.meal_plan ?? null,
    notes: plan.notes ?? null,
  };
  const plansForBulk = dates.map((date) => ({ date, ...planForPersist }));

  const reasonText = `auto-synth: ${dateLabel} | ${specialists.join("+")}`;
  const toolResult = await executeTool(
    { userId, now: new Date(), source: "chat:orchestrator" },
    "propose_plan_bulk",
    { reason: reasonText, plans: plansForBulk },
  );
  if (!toolResult.ok) {
    throw new Error(`propose_plan_bulk_failed: ${toolResult.error ?? "unknown"}`);
  }
  const data = toolResult.data as { pending_id: string; dates: string[] };

  // Persist the synthesis turn to conversations so chat history survives
  // page navigation / tab close. runAgent does this automatically; we
  // bypass it on the synthesis path so we have to log here directly. Tool
  // events are attached to the assistant row (single-row pattern, unlike
  // runAgent's separate "tool" row) so the chat page can re-render the
  // Apply/Reject card on reload by reading conversations.tool_calls.
  const persistedToolEvents = [
    {
      tool: "propose_plan_bulk",
      args: { reason: reasonText, plans: plansForBulk },
      result: {
        ok: true,
        data: {
          pending_id: data.pending_id,
          count: data.dates.length,
          dates: data.dates,
          status: "pending",
          review_url: "/dashboard/plan",
          note: "Plan saved as draft — user must approve at /dashboard/plan to apply.",
        },
      },
    },
  ];
  try {
    // user message was already logged at the start of this function
    await logTurn(
      userId,
      "orchestrator",
      "assistant",
      summary,
      persistedToolEvents,
    );
  } catch (err) {
    // Logging failure shouldn't break the response — the pending plan is
    // already in the DB and the user can still see it on /dashboard/plan.
    console.warn("[plan-synthesis] logTurn(assistant) failed:", err);
  }

  return {
    reply: summary,
    pendingPlanId: data.pending_id,
    dates: data.dates,
    plan,
    plansForCard: plansForBulk,
  };
}

export function isPlanSynthesisRoute(
  message: string,
  routedAgents: RoutedAgent[],
): { yes: true; specialists: PlanSpecialist[] } | { yes: false } {
  if (!isPlanIntent(message)) return { yes: false };
  const specialists: PlanSpecialist[] = [];
  if (routedAgents.includes("trainer")) specialists.push("trainer");
  if (routedAgents.includes("meal_designer")) specialists.push("meal_designer");
  if (specialists.length < 2) return { yes: false };
  return { yes: true, specialists };
}
