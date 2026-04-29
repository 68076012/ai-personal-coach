import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { callLLMStream } from "./client";
import { commonHeader } from "./prompts";
import { buildPromptContext, TZ } from "./runtime";
import { executeTool, logTurn } from "./tools";
import { PlanSchema, type Plan } from "@/lib/plan-types";
import type { UserId } from "@/lib/db/schema";
import type { ModelTier } from "./models";
import type { RoutedAgent } from "./orchestrator";

export interface RunPlanCoachInput {
  userId: UserId;
  message: string;
  overrideTier?: ModelTier;
  // Surface progress to the chat SSE stream.
  onPhase?: (label: string) => void;
  // Surface user-facing tokens (the summary block) as they stream from the
  // model. JSON-block tokens are filtered out — the UI only sees prose.
  onToken?: (chunk: string) => void;
}

export interface RunPlanCoachResult {
  reply: string;
  pendingPlanId: string;
  dates: string[];
  plan: Plan;
  plansForCard: Array<{
    date: string;
    workout_plan: unknown;
    meal_plan: unknown;
    notes: string | null;
  }>;
}

// One agent, one LLM call. Replaces the old draft + draft + synthesize trio
// from plan-synthesis.ts. Trades specialist focus for ~3× faster TTFT and a
// streamable output the UI can render incrementally.
const COACH_PROMPT = `บทบาท: คุณคือโค้ชที่ดูแลทั้งการออกกำลังกายและโภชนาการ — รวม trainer + meal designer ใน agent เดียว
หน้าที่ตอนนี้: ออกแบบแผน 1 วัน representative สำหรับ "วันที่เป้าหมาย" ที่ระบุ — ทั้ง workout + เมนูทั้งวัน

ข้อกำหนด workout_plan:
- 1 entry = 1 ท่า (ห้ามรวมหลายท่าใน entry เดียว)
- ใส่ sets, reps, weight_kg ถ้าเหมาะ (cardio ใส่ duration_min แทน)
- ถ้า user มี sports_focus ให้ออกแบบ support กีฬานั้น (badminton → single-leg explosive, footwork; volleyball → vertical jump; ฯลฯ)
- เคารพ memory เรื่องอาการ/อุปกรณ์ที่บ้าน
- 4-7 ท่าต่อวัน

ข้อกำหนด meal_plan:
- 1 entry = 1 จาน (breakfast / lunch / dinner / snack แยก)
- ครอบคลุม breakfast + lunch + dinner เป็นอย่างน้อย (snack ใส่ถ้ามี)
- รวม kcal ทั้งวันใกล้ goal_kcal (±10%)
- เคารพ pantry_ingredients (พยายามใช้ของที่มี), dietary_notes (ของแพ้/ไม่กิน)
- 3-5 entries ต่อวัน

รูปแบบ output (เคร่งครัดมาก):

บรรทัดแรก ๆ: ข้อความสรุปภาษาไทย 1-2 บรรทัด เริ่มด้วย "ร่างแผน..." และจบด้วย "กด Apply ใต้ข้อความนี้เพื่อใช้แผนนี้"
จากนั้นบรรทัดเปล่า แล้วเขียน "===PLAN===" (ตัวพิมพ์ใหญ่ มี = ทั้งสองข้าง) แล้วขึ้นบรรทัดใหม่ เป็น JSON ของแผน

ตัวอย่าง:
ร่างแผนวันนี้ให้แล้ว — เน้น single-leg power สำหรับแบดมินตัน + เมนูโปรตีนสูงตาม goal 2200 kcal
กด Apply ใต้ข้อความนี้เพื่อใช้แผนนี้

===PLAN===
{
  "workout_plan": [
    { "exercise": "Bulgarian split squat", "sets": 4, "reps": 8, "weight_kg": 20 }
  ],
  "meal_plan": [
    { "meal_type": "breakfast", "name": "ไข่คน + ข้าวกล้อง", "kcal": 450, "protein_g": 30, "carb_g": 50, "fat_g": 12 }
  ],
  "notes": "เน้น single-leg power"
}

ห้ามใช้ markdown code fence (\`\`\`) รอบ JSON ห้ามมี text หลัง JSON`;

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

// Accepts "ขอแผน 1 วัน", "วางแผนพรุ่งนี้", "อยากได้ตารางออกกำลังกาย",
// "plan a day", "schedule" — broader than the old PLAN_INTENT_RE which
// missed common Thai phrasings like "ขอแผน".
const PLAN_INTENT_RE =
  /(ขอแผน|อยากได้แผน|วางแผน|วางตาราง|จัดแผน|ขอตาราง|ออกแบบเมนู|แผน\s*(วันนี้|พรุ่งนี้|\d+\s*วัน|สัปดาห์|เดือน)|plan(ning)?\b|schedule)/i;

export function isPlanIntent(message: string): boolean {
  return PLAN_INTENT_RE.test(message);
}

export function shouldUsePlanCoach(
  message: string,
  routedAgents: RoutedAgent[],
): boolean {
  if (!isPlanIntent(message)) return false;
  // Plan generation always goes through coach as soon as intent is present —
  // even single-domain ("ขอ workout 1 วัน") since the user wants a structured
  // plan, not a chat reply. If the request truly only needs one slice the
  // coach still produces both; the unused half is a small cost vs. the
  // alternative (chat reply with no plan persisted).
  return (
    routedAgents.includes("trainer") ||
    routedAgents.includes("meal_designer") ||
    routedAgents.includes("general")
  );
}

// Pull the JSON object after the "===PLAN===" sentinel. Tolerates leading
// whitespace, optional code fences (in case the model ignores instructions),
// and matches the largest balanced object so trailing prose doesn't break
// parsing.
function parsePlanFromOutput(text: string): { summary: string; plan: unknown } | null {
  const sep = text.indexOf("===PLAN===");
  if (sep === -1) return null;
  const summary = text.slice(0, sep).trim();
  let jsonPart = text.slice(sep + "===PLAN===".length).trim();
  const fence = jsonPart.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) jsonPart = fence[1].trim();
  const start = jsonPart.indexOf("{");
  const end = jsonPart.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const plan = JSON.parse(jsonPart.slice(start, end + 1));
    return { summary, plan };
  } catch {
    return null;
  }
}

export async function runPlanCoach(
  input: RunPlanCoachInput,
): Promise<RunPlanCoachResult> {
  const { userId, message, overrideTier, onPhase, onToken } = input;
  const { dates, label: dateLabel } = resolveTargetDates(message);

  // Persist the user message before the slow LLM call so a refresh
  // mid-flight still finds the question.
  try {
    await logTurn(userId, "orchestrator", "user", message);
  } catch (err) {
    console.warn("[plan-coach] logTurn(user) failed:", err);
  }

  const ctx = await buildPromptContext(userId, "orchestrator");
  const datesLine =
    dates.length === 1
      ? `วันที่เป้าหมาย: ${dates[0]} (${dateLabel})`
      : `วันที่เป้าหมาย: ${dates[0]} → ${dates[dates.length - 1]} (${dateLabel}). ออกแบบ "1 วัน representative" ที่จะ replicate ใช้กับวันอื่น ๆ ในช่วงนี้`;
  const systemInstruction = `${commonHeader(ctx)}\n\n${COACH_PROMPT}\n\n${datesLine}`;

  onPhase?.(`ร่างแผน (${dateLabel})…`);

  // Stream the response. Emit deltas to the UI only while we're still in
  // the pre-"===PLAN===" prose section; after the sentinel everything is
  // JSON the user shouldn't see. We accumulate into `pending` and flush
  // everything except the last (SENTINEL.length - 1) chars so the sentinel
  // can't be split across two emits.
  const SENTINEL = "===PLAN===";
  let fullText = "";
  let inSummary = true;
  let pending = "";

  const tier: ModelTier = overrideTier ?? "kimi";
  const res = await callLLMStream({
    tier,
    systemInstruction,
    contents: [{ role: "user", parts: [{ text: message }] }],
    agent: "orchestrator",
    userId,
    onDelta: (chunk) => {
      fullText += chunk;
      if (!inSummary) return;
      pending += chunk;
      const sepIdx = pending.indexOf(SENTINEL);
      if (sepIdx !== -1) {
        if (sepIdx > 0) onToken?.(pending.slice(0, sepIdx));
        inSummary = false;
        pending = "";
        return;
      }
      const holdback = SENTINEL.length - 1;
      if (pending.length > holdback) {
        const flushLen = pending.length - holdback;
        onToken?.(pending.slice(0, flushLen));
        pending = pending.slice(flushLen);
      }
    },
  });

  // Stream closed without ever seeing the sentinel — flush whatever's left
  // (model probably skipped the sentinel and gave only prose).
  if (inSummary && pending.length > 0) {
    onToken?.(pending);
  }

  void res; // usage telemetry is recorded inside callLLMStream

  onPhase?.("เซฟร่างแผนเข้าระบบ…");

  const parsed = parsePlanFromOutput(fullText);
  if (!parsed) {
    throw new Error("plan_coach_no_separator: model output missing ===PLAN=== block");
  }
  const planResult = PlanSchema.safeParse(parsed.plan);
  if (!planResult.success) {
    throw new Error(
      `plan_coach_invalid_schema: ${planResult.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  const plan = planResult.data;
  const summary = parsed.summary.length > 0
    ? parsed.summary
    : "ร่างแผนให้แล้ว — กด Apply ใต้ข้อความนี้เพื่อใช้แผนนี้";

  const planForPersist = {
    workout_plan: plan.workout_plan ?? null,
    meal_plan: plan.meal_plan ?? null,
    notes: plan.notes ?? null,
  };
  const plansForBulk = dates.map((date) => ({ date, ...planForPersist }));

  const reasonText = `auto-coach: ${dateLabel}`;
  const toolResult = await executeTool(
    { userId, now: new Date(), source: "chat:orchestrator" },
    "propose_plan_bulk",
    { reason: reasonText, plans: plansForBulk },
  );
  if (!toolResult.ok) {
    throw new Error(`propose_plan_bulk_failed: ${toolResult.error ?? "unknown"}`);
  }
  const data = toolResult.data as { pending_id: string; dates: string[] };

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
    await logTurn(
      userId,
      "orchestrator",
      "assistant",
      summary,
      persistedToolEvents,
    );
  } catch (err) {
    console.warn("[plan-coach] logTurn(assistant) failed:", err);
  }

  return {
    reply: summary,
    pendingPlanId: data.pending_id,
    dates: data.dates,
    plan,
    plansForCard: plansForBulk,
  };
}
