import { NextResponse } from "next/server";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { verifyCronAuth } from "@/lib/cron-auth";
import { runAgent, TZ } from "@/lib/llm/runtime";
import { MEAL_DESIGNER_PROMPT, TRAINER_PROMPT } from "@/lib/llm/prompts";
import type { UserId } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const USERS: UserId[] = ["garfield", "partner", "test"];

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const tomorrow = formatInTimeZone(addDays(new Date(), 1), TZ, "yyyy-MM-dd");
  const tomorrowDow = formatInTimeZone(addDays(new Date(), 1), TZ, "EEEE");

  const results = await Promise.allSettled(
    USERS.map(async (userId) => {
      const meals = await runAgent({
        userId,
        agent: "meal_designer",
        userMessage: `วางเมนูให้พรุ่งนี้ (${tomorrow}, ${tomorrowDow}) — เน้นใกล้ goal kcal และสัดส่วน macro. เรียก propose_meals ให้ครบ`,
        systemSuffix: MEAL_DESIGNER_PROMPT,
        task: "plan",
        persistConversation: false,
      });
      const workout = await runAgent({
        userId,
        agent: "trainer",
        userMessage: `ออกแบบ workout สำหรับพรุ่งนี้ (${tomorrow}, ${tomorrowDow}) ตาม progressive overload. เรียก update_plan โดยใส่ workout_plan ของวัน ${tomorrow}`,
        systemSuffix: TRAINER_PROMPT,
        task: "plan",
        estimatedComplexity: "medium",
        persistConversation: false,
      });
      return {
        userId,
        meals_tools: meals.toolEvents.length,
        workout_tools: workout.toolEvents.length,
      };
    }),
  );

  return NextResponse.json({
    ok: true,
    date: tomorrow,
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
