import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { LLMChainError, type LLMChainKind } from "@/lib/llm/client";
import { runAgent } from "@/lib/llm/runtime";
import { routeMessage, specialistsFor } from "@/lib/llm/orchestrator";
import {
  TRAINER_PROMPT,
  NUTRITIONIST_PROMPT,
  MEAL_DESIGNER_PROMPT,
  REPORTER_PROMPT,
} from "@/lib/llm/prompts";

const CHAIN_USER_MESSAGE: Record<LLMChainKind, string> = {
  gemini_quota:
    "Gemini quota หมดวันนี้ — รีเซ็ตประมาณ 14:00 ICT 🕑 ระหว่างนี้ลองอีกครั้ง 1-2 นาที (ระบบจะลอง Kimi ให้)",
  kimi_overload:
    "Kimi (fallback) แน่นอยู่ตอนนี้ — engine overloaded ไม่ใช่ปัญหา balance. ลองอีกที 30-60 วินาที 🙏",
  all_failed:
    "AI ทุก provider ขัดข้องชั่วคราว — ลองอีกครั้งใน 1-2 นาที. ถ้ายังเป็นอยู่ เช็ค /dashboard/admin",
};

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

  let agents: Array<keyof typeof PROMPT_BY_AGENT>;
  let routedNotice: string | null = null;

  if (parsed.data.agent === "auto") {
    const routed = await routeMessage(parsed.data.message);
    if (routed.confidence < 0.6 && !routed.agents.includes("general")) {
      // Borderline → ask user to disambiguate (single short reply)
      routedNotice =
        "ยังไม่แน่ใจว่าควรให้ใครตอบดี ลองบอกเพิ่มอีกนิดได้มั้ย? เช่น เกี่ยวกับมื้ออาหาร, ออกกำลังกาย, แผนพรุ่งนี้?";
    }
    agents = specialistsFor(routed.agents);
  } else {
    agents = [parsed.data.agent];
  }

  if (routedNotice) {
    return NextResponse.json({
      ok: true,
      replies: [
        {
          agent: "orchestrator",
          reply: routedNotice,
          toolEvents: [],
        },
      ],
    });
  }

  console.log(
    `[/api/chat] dispatching to ${agents.length} agent(s): ${agents.join(", ")}`,
  );

  // Resilient sequential dispatch — each agent runs against the same user
  // message with its own conversation history (filtered by agent_type).
  // If one agent fails, the others' replies still come back — the user
  // gets partial answers instead of seeing the whole thing fail. Only
  // when EVERY agent fails do we fall through to the LLMChainError /
  // generic catch handlers below.
  const replies: Array<{ agent: string; reply: string; toolEvents: unknown[] }> = [];
  const failures: Array<{ agent: string; error: string; kind?: string }> = [];

  for (const agent of agents) {
    try {
      const result = await runAgent({
        userId: session.userId,
        agent,
        userMessage: parsed.data.message,
        systemSuffix: PROMPT_BY_AGENT[agent],
        task: agent === "reporter" ? "report" : "chat",
        persistConversation: true,
      });
      replies.push({
        agent: result.agent,
        reply: result.reply,
        toolEvents: result.toolEvents,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const kind = err instanceof LLMChainError ? err.kind : undefined;
      console.warn(`[/api/chat] agent=${agent} failed:`, errMsg);
      failures.push({ agent, error: errMsg, kind });
    }
  }

  if (replies.length > 0) {
    return NextResponse.json({
      ok: true,
      replies,
      ...(failures.length > 0 ? { partial_failures: failures } : {}),
    });
  }

  // Every agent failed. Synthesize an LLMChainError-shaped response so the
  // existing client error path renders a meaningful message.
  const firstFailure = failures[0];
  if (firstFailure) {
    const kind = (firstFailure.kind as LLMChainKind | undefined) ?? "all_failed";
    return NextResponse.json(
      {
        ok: false,
        error: kind,
        message: CHAIN_USER_MESSAGE[kind],
        details: failures,
      },
      { status: 429 },
    );
  }

  // Should be unreachable (agents.length === 0 would already have been
  // caught by the routedNotice short-circuit), but keep a safety net.
  return NextResponse.json(
    { ok: false, error: "no_agents", message: "ไม่พบ agent ที่จะตอบ" },
    { status: 500 },
  );
}
