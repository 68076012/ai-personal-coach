import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { runAgent } from "@/lib/llm/runtime";
import { routeMessage, specialistFor } from "@/lib/llm/orchestrator";
import {
  TRAINER_PROMPT,
  NUTRITIONIST_PROMPT,
  MEAL_DESIGNER_PROMPT,
  REPORTER_PROMPT,
} from "@/lib/llm/prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  message: z.string().min(1).max(4000),
  agent: z
    .enum(["trainer", "nutritionist", "meal_designer", "reporter", "auto"])
    .default("auto"),
});

const PROMPT_BY_AGENT = {
  trainer: TRAINER_PROMPT,
  nutritionist: NUTRITIONIST_PROMPT,
  meal_designer: MEAL_DESIGNER_PROMPT,
  reporter: REPORTER_PROMPT,
} as const;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  }
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "bad_input" }, { status: 400 });
  }

  let agent: keyof typeof PROMPT_BY_AGENT;
  let routedNotice: string | null = null;

  if (parsed.data.agent === "auto") {
    const routed = await routeMessage(parsed.data.message);
    if (routed.confidence < 0.6 && routed.agent !== "general") {
      // Borderline → ask user to disambiguate (non-blocking helper, then fall through)
      routedNotice =
        "ยังไม่แน่ใจว่าควรให้ใครตอบดี ลองบอกเพิ่มอีกนิดได้มั้ย? เช่น เกี่ยวกับมื้ออาหาร, ออกกำลังกาย, แผนพรุ่งนี้?";
    }
    agent = specialistFor(routed.agent);
  } else {
    agent = parsed.data.agent;
  }

  if (routedNotice) {
    return NextResponse.json({
      ok: true,
      reply: routedNotice,
      agent: "orchestrator",
      toolEvents: [],
    });
  }

  try {
    const result = await runAgent({
      userId: session.userId,
      agent,
      userMessage: parsed.data.message,
      systemSuffix: PROMPT_BY_AGENT[agent],
      task: agent === "reporter" ? "report" : "chat",
      persistConversation: true,
    });
    return NextResponse.json({
      ok: true,
      reply: result.reply,
      agent: result.agent,
      toolEvents: result.toolEvents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat]", err);
    if (/all tiers exhausted|RESOURCE_EXHAUSTED|429/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error: "quota_exhausted",
          message: "AI quota หมดวันนี้ — ลองพรุ่งนี้นะ 🙏",
        },
        { status: 429 },
      );
    }
    if (/GOOGLE_API_KEY/.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_api_key",
          message: "ยังไม่ได้ตั้งค่า GOOGLE_API_KEY ใน .env.local",
        },
        { status: 503 },
      );
    }
    if (/DATABASE_URL|ECONNREFUSED|getaddrinfo|connect ETIMEDOUT/i.test(msg)) {
      return NextResponse.json(
        {
          ok: false,
          error: "db_unreachable",
          message: "เชื่อมต่อฐานข้อมูลไม่ได้ — เช็ค DATABASE_URL ใน .env.local",
        },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { ok: false, error: "internal", message: msg },
      { status: 500 },
    );
  }
}
