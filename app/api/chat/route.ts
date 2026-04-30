import { z } from "zod";
import { getSession } from "@/lib/auth";
import { LLMChainError, type LLMChainKind } from "@/lib/llm/client";
import { runAgent } from "@/lib/llm/runtime";
import type { ModelTier } from "@/lib/llm/models";
import { COACH_PROMPT } from "@/lib/llm/prompts";

const CHAIN_USER_MESSAGE: Record<LLMChainKind, string> = {
  kimi_overload:
    "Kimi engine กำลังหนาแน่น — ไม่ใช่ปัญหา balance. ลองอีกที 30-60 วินาที 🙏",
  all_failed:
    "AI ขัดข้องชั่วคราว — ลองอีกครั้งใน 1-2 นาที. ถ้ายังเป็นอยู่ เช็ค /dashboard/admin",
};

export const runtime = "nodejs";
// 300s is the Vercel Pro ceiling. Kimi K2.6 reasoning calls routinely
// run 200-900s on multi-day plans, so 120s was killing the function
// before the model could finish; 300s buys enough room for a single
// chat turn (one outer LLM call + a few tool roundtrips). On Render
// the container runs without an enforced timeout so the value is
// mostly informational there.
export const maxDuration = 300;

const Body = z.object({
  message: z.string().min(1).max(4000),
  model: z.enum(["kimi", "auto"]).default("auto"),
});

const HEARTBEAT_MS = 5000;
const ENC = new TextEncoder();

function sseFrame(event: string, data: unknown): Uint8Array {
  return ENC.encode(
    `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
  );
}

// SSE event taxonomy:
//   - phase   { message }   — human-readable progress label
//   - heartbeat              — every 5s while work is in flight
//   - result  { replies }    — final payload (single coach reply)
//   - error   { kind?, message, details? } — terminal failure
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
  const userId = session.userId;
  const json = await req.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return errorResponse(400, { ok: false, error: "bad_input" });
  }

  const overrideTier: ModelTier | undefined =
    parsed.data.model === "auto" ? undefined : (parsed.data.model as ModelTier);

  return makeSseResponse(async (send) => {
    try {
      const result = await runAgent({
        userId,
        agent: "coach",
        userMessage: parsed.data.message,
        systemSuffix: COACH_PROMPT,
        task: "chat",
        persistConversation: true,
        overrideTier,
        // Surface tool-loop progress through the SSE stream so the user
        // sees what the model is doing instead of staring at heartbeats.
        onPhase: (msg) => send("phase", { message: msg }),
      });
      send("result", {
        ok: true,
        replies: [
          {
            agent: result.agent,
            reply: result.reply,
            toolEvents: result.toolEvents,
          },
        ],
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const kind: LLMChainKind =
        err instanceof LLMChainError ? err.kind : "all_failed";
      console.warn(`[/api/chat] coach failed:`, errMsg);
      send("error", {
        kind,
        message: CHAIN_USER_MESSAGE[kind],
        details: [{ agent: "coach", error: errMsg, kind }],
      });
    }
  });
}
