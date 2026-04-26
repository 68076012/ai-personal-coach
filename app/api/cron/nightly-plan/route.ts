import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runAgent, TZ } from "@/lib/llm/runtime";
import { MEAL_DESIGNER_PROMPT, TRAINER_PROMPT } from "@/lib/llm/prompts";
import { getDailyPlan, pruneExpiredAgentMemory } from "@/lib/db/queries";
import { runConversationArchival } from "@/lib/llm/archive";
import type { UserId } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const USERS: UserId[] = ["garfield", "partner"];

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const tomorrow = formatInTimeZone(addDays(new Date(), 1), TZ, "yyyy-MM-dd");
  const tomorrowDow = formatInTimeZone(addDays(new Date(), 1), TZ, "EEEE");

  const pruned = await pruneExpiredAgentMemory().catch(() => 0);

  // Conversation archival — summarize >30-day-old turns into agent_memory
  // and delete the originals. Bounded at 8 weeks per run so API spend
  // stays predictable; backlog clears across nights if it exists.
  const archiveCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const archive = await runConversationArchival({
    cutoffDate: archiveCutoff,
    maxWeeks: 8,
  }).catch((err) => {
    console.warn("[cron/nightly] archival failed:", err);
    return { archived: [], skipped: 0, errors: 1 };
  });

  const results = await Promise.allSettled(
    USERS.map(async (userId) => {
      const tomorrowPlan = await getDailyPlan(userId, tomorrow).catch(() => null);
      const workoutPaused = tomorrowPlan?.workout_paused === true;

      const meals = await runAgent({
        userId,
        agent: "meal_designer",
        userMessage: `วางเมนูให้พรุ่งนี้ (${tomorrow}, ${tomorrowDow}) — เน้นใกล้ goal kcal และสัดส่วน macro. เรียก propose_meals ให้ครบ`,
        systemSuffix: MEAL_DESIGNER_PROMPT,
        task: "plan",
        persistConversation: false,
      });

      let workoutToolCount = 0;
      if (!workoutPaused) {
        const workout = await runAgent({
          userId,
          agent: "trainer",
          userMessage: `ออกแบบ workout สำหรับพรุ่งนี้ (${tomorrow}, ${tomorrowDow}) ตาม progressive overload. เรียก update_plan โดยใส่ workout_plan ของวัน ${tomorrow}`,
          systemSuffix: TRAINER_PROMPT,
          task: "plan",
          estimatedComplexity: "medium",
          persistConversation: false,
        });
        workoutToolCount = workout.toolEvents.length;
      }

      return {
        userId,
        meals_tools: meals.toolEvents.length,
        workout_tools: workoutToolCount,
        workout_paused: workoutPaused,
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    date: tomorrow,
    pruned_memory_rows: pruned,
    archive: {
      summarized_weeks: archive.archived.length,
      skipped_weeks: archive.skipped,
      errors: archive.errors,
      details: archive.archived,
    },
    results: results.map((r, i) =>
      r.status === "fulfilled"
        ? { user: USERS[i], ok: true, ...r.value }
        : {
            user: USERS[i],
            ok: false,
            error: r.reason instanceof Error ? r.reason.message : String(r.reason),
          },
    ),
  });
}

export const POST = GET;
