import { z } from "zod";
import { getSession } from "@/lib/auth";
import { LLMChainError, type LLMChainKind } from "@/lib/llm/client";
import { runAgent } from "@/lib/llm/runtime";
import { routeMessage, specialistsFor } from "@/lib/llm/orchestrator";
import { runPlanCoach, shouldUsePlanCoach } from "@/lib/llm/plan-coach";
import {
  TRAINER_PROMPT,
  NUTRITIONIST_PROMPT,
  MEAL_DESIGNER_PROMPT,
  REPORTER_PROMPT,
} from "@/lib/llm/prompts";

const CHAIN_USER_MESSAGE: Record<LLMChainKind, string> = {
  kimi_overload:
    "Kimi engine กำลังหนาแน่น — ไม่ใช่ปัญหา balance. ลองอีกที 30-60 วินาที 🙏",
  all_failed:
    "AI ขัดข้องชั่วคราว — ลองอีกครั้งใน 1-2 นาที. ถ้ายังเป็นอยู่ เช็ค /dashboard/admin",
};

export const runtime = "nodejs";
// On Vercel Hobby/Pro this caps the function. On Render the container runs
// without an enforced timeout, so the value is mostly informational there.
export const maxDuration = 120;

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

const HEARTBEAT_MS = 5000;
const ENC = new TextEncoder();

function sseFrame(event: string, data: unknown): Uint8Array {
  return ENC.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

// Simple JSON-shaped SSE stream. Events emitted:
//   - phase   { message }   — human-readable progress label
//   - heartbeat              — every 5s while work is in flight, no payload
//   - result  { replies, partial_failures? } — final payload, same shape
//                                              the old JSON response used
//   - error   { kind?, message, details? }   — terminal failure
// Client closes the reader on result or error.
function makeSseResponse(
  body: (send: (event: string, data?: unknown) => void) => Promise<void>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data?: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(sseFrame(event, data ?? {}));
        } catch {
          // controller already torn down — ignore
        }
      };

      // Open with a comment frame so any intermediate proxies flush headers.
      controller.enqueue(ENC.encode(`: open\n\n`));

      const heartbeat = setInterval(() => send("heartbeat"), HEARTBEAT_MS);

      try {
        await body(send);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { message });
      } finally {
        clearInterval(heartbeat);
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable proxy buffering (nginx, etc.) so events flush in real time.
      "X-Accel-Buffering": "no",
    },
  });
}

function errorResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId) {
    return errorResponse(401, { ok: false, error: "unauthenticated" });
  }
  // Capture under a const so the closure inside the SSE body sees a
  // narrowed UserId, not the possibly-undefined session field.
  const userId = session.userId;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return errorResponse(400, { ok: false, error: "bad_input" });
  }

  return makeSseResponse(async (send) => {
    let agents: Array<keyof typeof PROMPT_BY_AGENT>;
    let usePlanCoach = false;

    send("phase", { message: "เลือก agent ที่จะตอบ…" });

    if (parsed.data.agent === "auto") {
      const routed = await routeMessage(parsed.data.message);
      if (routed.confidence < 0.6 && !routed.agents.includes("general")) {
        send("result", {
          ok: true,
          replies: [
            {
              agent: "orchestrator",
              reply:
                "ยังไม่แน่ใจว่าควรให้ใครตอบดี ลองบอกเพิ่มอีกนิดได้มั้ย? เช่น เกี่ยวกับมื้ออาหาร, ออกกำลังกาย, แผนพรุ่งนี้?",
              toolEvents: [],
            },
          ],
        });
        return;
      }
      usePlanCoach = shouldUsePlanCoach(parsed.data.message, routed.agents);
      agents = specialistsFor(routed.agents);
    } else {
      agents = [parsed.data.agent];
    }

    if (usePlanCoach) {
      console.log(`[/api/chat] plan-coach path (single-agent streaming)`);
      try {
        const result = await runPlanCoach({
          userId,
          message: parsed.data.message,
          onPhase: (msg) => send("phase", { message: msg }),
          // Forward each token straight through to the SSE stream so the
          // chat UI renders prose incrementally instead of waiting for the
          // whole plan to land. Heartbeat-only requests were the symptom
          // we shipped this for.
          onToken: (chunk) => send("token", { text: chunk }),
        });
        send("result", {
          ok: true,
          replies: [
            {
              agent: "orchestrator",
              reply: result.reply,
              toolEvents: [
                {
                  tool: "propose_plan_bulk",
                  args: {
                    reason: `auto-coach`,
                    plans: result.plansForCard,
                  },
                  result: {
                    ok: true,
                    data: {
                      pending_id: result.pendingPlanId,
                      count: result.dates.length,
                      dates: result.dates,
                      status: "pending",
                      review_url: "/dashboard/plan",
                      note: "Plan saved as draft — user must approve at /dashboard/plan to apply.",
                    },
                  },
                },
              ],
            },
          ],
        });
        return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[/api/chat] plan-coach failed, falling back: ${msg}`);
        send("phase", {
          message: "ลองวิธีสำรอง — ส่งให้ specialist ตอบ…",
        });
      }
    }

    console.log(
      `[/api/chat] dispatching to ${agents.length} agent(s): ${agents.join(", ")}`,
    );

    const replies: Array<{ agent: string; reply: string; toolEvents: unknown[] }> = [];
    const failures: Array<{ agent: string; error: string; kind?: string }> = [];

    for (const agent of agents) {
      send("phase", { message: `${agent} กำลังตอบ…` });
      try {
        const result = await runAgent({
          userId,
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
      send("result", {
        ok: true,
        replies,
        ...(failures.length > 0 ? { partial_failures: failures } : {}),
      });
      return;
    }

    const firstFailure = failures[0];
    if (firstFailure) {
      const kind = (firstFailure.kind as LLMChainKind | undefined) ?? "all_failed";
      send("error", {
        kind,
        message: CHAIN_USER_MESSAGE[kind],
        details: failures,
      });
      return;
    }

    send("error", { message: "ไม่พบ agent ที่จะตอบ" });
  });
}
