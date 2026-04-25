import { NextResponse } from "next/server";
import { verifyCronAuth } from "@/lib/cron-auth";
import { generateMorningReport } from "@/lib/llm/reporter";
import { lineUserIdFor, pushLineMessage } from "@/lib/line";
import type { UserId } from "@/lib/db/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const USERS: UserId[] = ["garfield", "partner"];

export async function GET(req: Request) {
  const auth = verifyCronAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const results = await Promise.allSettled(
    USERS.map(async (userId) => {
      const report = await generateMorningReport(userId);
      const lineId = lineUserIdFor(userId);
      if (lineId) {
        await pushLineMessage(lineId, `🌅 สรุปเช้านี้\n\n${report.summary}`);
      }
      return { userId, len: report.summary.length };
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
