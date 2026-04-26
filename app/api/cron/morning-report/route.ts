import { NextResponse } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import { verifyCronAuth } from "@/lib/cron-auth";
import { generateMorningReport } from "@/lib/llm/reporter";
import { lineUserIdFor, pushLineMessage } from "@/lib/line";
import { getDailyPlan } from "@/lib/db/queries";
import { TZ } from "@/lib/llm/runtime";
import type { UserId } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const USERS: UserId[] = ["garfield", "partner"];

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");

  const results = await Promise.allSettled(
    USERS.map(async (userId) => {
      const todayPlan = await getDailyPlan(userId, today).catch(() => null);
      const workoutPaused = todayPlan?.workout_paused === true;

      const report = await generateMorningReport(userId);
      const lineId = lineUserIdFor(userId);
      if (lineId) {
        const prefix = workoutPaused
          ? "🌅 สรุปเช้านี้ (วันนี้พัก workout)\n\n"
          : "🌅 สรุปเช้านี้\n\n";
        await pushLineMessage(lineId, `${prefix}${report.summary}`);
      }
      return { userId, len: report.summary.length, workout_paused: workoutPaused };
    }),
  );

  return NextResponse.json({
    ok: true,
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

// Vercel sometimes calls cron via POST; accept both
export const POST = GET;
