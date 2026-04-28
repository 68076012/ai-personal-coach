import { formatInTimeZone } from "date-fns-tz";
import type { Content } from "./types";
import {
  getAgentMemory,
  getConversationHistory,
  getDailyPlan,
  getDayMacros,
  getRecentMeals,
  getRecentWorkouts,
  getUser,
} from "@/lib/db/queries";
import type { AgentType, UserId } from "@/lib/db/schema";
import { callLLM } from "./client";
import { chooseModel, type AgentName, type ModelTier, type Task } from "./models";
import { commonHeader, type PromptContext } from "./prompts";
import { sanitizeAssistantText } from "./sanitize";
import {
  declarationsForAgent,
  executeTool,
  logTurn,
  type ToolContext,
} from "./tools";

export const TZ = "Asia/Bangkok";

const AGENT_MEMORY_KEY: Record<
  Exclude<AgentName, "orchestrator">,
  AgentType
> = {
  trainer: "trainer",
  nutritionist: "nutritionist",
  meal_designer: "meal_designer",
  reporter: "shared",
};

export async function buildPromptContext(userId: UserId, agent: AgentName): Promise<PromptContext> {
  const user = await getUser(userId);
  if (!user) throw new Error(`unknown user: ${userId}`);

  const now = new Date();
  const todayDate = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const dayOfWeek = formatInTimeZone(now, TZ, "EEEE");

  const memoryAgent: AgentType =
    agent === "orchestrator" ? "shared" : AGENT_MEMORY_KEY[agent];

  const dayStart = new Date(`${todayDate}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const [memory, todayPlan, todayMacros, recentMeals, recentWorkouts] = await Promise.all([
    getAgentMemory(userId, memoryAgent, 20),
    getDailyPlan(userId, todayDate),
    getDayMacros(userId, dayStart, dayEnd),
    getRecentMeals(userId, 6),
    getRecentWorkouts(userId, 6),
  ]);

  return {
    user,
    todayDate,
    dayOfWeek,
    memory,
    todayPlan,
    todayMacros,
    recentMeals,
    recentWorkouts,
  };
}

function toContent(role: "user" | "model", text: string): Content {
  return { role, parts: [{ text }] };
}

export interface RunAgentInput {
  userId: UserId;
  agent: Exclude<AgentName, "orchestrator">;
  userMessage: string;
  systemSuffix: string; // agent-specific prompt
  task?: Task;
  estimatedComplexity?: "low" | "medium" | "high";
  persistConversation?: boolean;
  // Force a specific model tier instead of `chooseModel(...)`. The fallback
  // chain in `client.ts` still applies if the chosen tier is unavailable —
  // this just sets the starting point.
  overrideTier?: ModelTier;
}

export interface RunAgentResult {
  reply: string;
  toolEvents: { tool: string; args: unknown; result: unknown }[];
  agent: AgentName;
}

export async function runAgent(input: RunAgentInput): Promise<RunAgentResult> {
  const ctx = await buildPromptContext(input.userId, input.agent);
  const systemInstruction = `${commonHeader(ctx)}\n\n${input.systemSuffix}`;
  const tools = declarationsForAgent(input.agent);

  const agentType: AgentType =
    input.agent === "meal_designer"
      ? "meal_designer"
      : (input.agent as AgentType);

  // Recent conversation history (this agent only) for short-term coherence
  const history = input.persistConversation
    ? await getConversationHistory(input.userId, agentType, 10)
    : [];

  const contents: Content[] = [];
  for (const turn of history) {
    if (turn.role === "user" || turn.role === "assistant") {
      contents.push(
        toContent(turn.role === "user" ? "user" : "model", turn.content),
      );
    }
  }
  contents.push(toContent("user", input.userMessage));

  const tier =
    input.overrideTier ??
    chooseModel({
      agent: input.agent,
      task: input.task ?? "chat",
      hasTools: tools.length > 0,
      estimatedComplexity: input.estimatedComplexity,
    });

  const toolCtx: ToolContext = {
    userId: input.userId,
    now: new Date(),
    source: `${input.persistConversation ? "chat" : "cron"}:${input.agent}`,
  };
  const toolEvents: RunAgentResult["toolEvents"] = [];

  let reply = "";
  let safetyCounter = 0;

  while (safetyCounter++ < 6) {
    const res = await callLLM({
      tier,
      systemInstruction,
      contents,
      tools,
      agent: input.agent,
      userId: input.userId,
    });

    const calls = res.functionCalls ?? [];
    const text = res.text ?? "";

    if (calls.length === 0) {
      reply = text.trim();
      break;
    }

    // Execute each function call sequentially and feed results back
    const modelParts: { text?: string; functionCall?: typeof calls[number] }[] = [];
    if (text) modelParts.push({ text });
    for (const c of calls) modelParts.push({ functionCall: c });
    contents.push({ role: "model", parts: modelParts });

    const toolResultParts: {
      functionResponse: { name: string; response: Record<string, unknown> };
    }[] = [];
    for (const c of calls) {
      const result = await executeTool(toolCtx, c.name ?? "", (c.args as Record<string, unknown>) ?? {});
      toolEvents.push({ tool: c.name ?? "", args: c.args, result });
      toolResultParts.push({
        functionResponse: {
          name: c.name ?? "unknown",
          response: result as unknown as Record<string, unknown>,
        },
      });
    }
    contents.push({ role: "user", parts: toolResultParts });
  }

  if (!reply) {
    reply = "(โค้ชยังไม่ได้ตอบ — ลองส่งข้อความใหม่อีกครั้ง)";
  }

  // Defensive: strip any `tool_code` / `thought` blocks the model sometimes
  // emits as text instead of using native function calling. The actual
  // tool call is lost when this regression happens (the SDK never sees a
  // functionCall part), but at least the chat bubble stays readable.
  const sanitized = sanitizeAssistantText(reply);
  reply = sanitized.cleaned || reply;
  if (sanitized.hadToolCodeText) {
    console.warn(
      `[runtime] agent=${input.agent} emitted tool_code text — actual tool call was dropped. Cleaned the bubble; user may need to ask again.`,
    );
  }

  if (input.persistConversation) {
    await logTurn(input.userId, agentType, "user", input.userMessage);
    if (toolEvents.length) {
      await logTurn(
        input.userId,
        agentType,
        "tool",
        `${toolEvents.length} tool call(s)`,
        toolEvents,
      );
    }
    await logTurn(input.userId, agentType, "assistant", reply);
  }

  return { reply, toolEvents, agent: input.agent };
}
