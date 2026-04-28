import { db } from "@/lib/db/client";
import { llm_calls } from "@/lib/db/schema";
import { MODEL_ID, type ModelTier } from "./models";
import { callKimi } from "./kimi";
import type {
  Content,
  FunctionCall,
  FunctionDeclaration,
  GenerateContentResponse,
} from "./types";

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

type TransientCause = "rate_limit" | "overloaded" | "server_error";

function classifyTransient(err: unknown): TransientCause | null {
  const e = err as { status?: number; message?: string; code?: number };
  if (!e) return null;
  const code = e.status ?? e.code;
  const msg = e.message ?? "";
  if (code === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return "rate_limit";
  if (code === 503 || /503|UNAVAILABLE|overloaded|high demand/i.test(msg)) return "overloaded";
  if (code === 500 || code === 502 || code === 504) return "server_error";
  return null;
}

export interface ChainAttempt {
  tier: ModelTier;
  model: string;
  cause: TransientCause | "fatal";
  error: string;
  retried?: boolean;
}

export type LLMChainKind = "kimi_overload" | "all_failed";

export class LLMChainError extends Error {
  kind: LLMChainKind;
  attempts: ChainAttempt[];
  constructor(kind: LLMChainKind, attempts: ChainAttempt[]) {
    const last = attempts[attempts.length - 1];
    super(
      `[llm] ${kind}: ${attempts.map((a) => `${a.tier}=${a.cause}`).join(" → ")}` +
        (last ? ` (last: ${last.error.slice(0, 160)})` : ""),
    );
    this.name = "LLMChainError";
    this.kind = kind;
    this.attempts = attempts;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CallParams {
  // Single tier today, but kept on the param so callsites stay stable if we
  // re-introduce alternatives. Always "kimi".
  tier: ModelTier;
  systemInstruction: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  agent?: string;
  userId?: string | null;
  // Accepted for legacy compatibility — Moonshot doesn't expose a thinking
  // budget knob, so it's ignored.
  thinkingBudget?: number;
}

async function attemptCall(
  tier: ModelTier,
  params: CallParams,
): Promise<{ ok: true; res: GenerateContentResponse } | { ok: false; err: unknown; latencyMs: number }> {
  const startedAt = Date.now();
  try {
    const res = await callKimi({
      model: MODEL_ID[tier],
      systemInstruction: params.systemInstruction,
      contents: params.contents,
      tools: params.tools,
    });
    void recordCall({
      model: MODEL_ID[tier],
      agent: params.agent,
      userId: params.userId ?? null,
      latencyMs: Date.now() - startedAt,
      usage: res.usageMetadata,
    });
    return { ok: true, res };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    void recordCall({
      model: MODEL_ID[tier],
      agent: params.agent,
      userId: params.userId ?? null,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, err, latencyMs };
  }
}

// Single LLM entry point. Calls Kimi K2.6 once, retries once after 2s on
// transient errors (429/503/5xx) before surfacing the failure.
export async function callLLM(
  params: CallParams,
): Promise<GenerateContentResponse> {
  const tier = params.tier;
  const attempts: ChainAttempt[] = [];

  let result = await attemptCall(tier, params);
  if (result.ok) return result.res;

  const transient = classifyTransient(result.err);
  const errMsg = result.err instanceof Error ? result.err.message : String(result.err);

  if (transient) {
    attempts.push({ tier, model: MODEL_ID[tier], cause: transient, error: errMsg, retried: true });
    console.warn(`[llm] ${tier} ${transient}, retrying once after 2s`);
    await sleep(2000);
    result = await attemptCall(tier, params);
    if (result.ok) return result.res;
    const retryMsg = result.err instanceof Error ? result.err.message : String(result.err);
    const retryCause = classifyTransient(result.err) ?? "fatal";
    attempts.push({ tier, model: MODEL_ID[tier], cause: retryCause, error: retryMsg, retried: true });
    throw new LLMChainError("kimi_overload", attempts);
  }

  // Non-transient (auth, bad request, missing API key) — fail immediately.
  attempts.push({ tier, model: MODEL_ID[tier], cause: "fatal", error: errMsg });
  throw new LLMChainError("all_failed", attempts);
}

interface CallRecord {
  model: string;
  agent?: string;
  userId: string | null;
  latencyMs: number;
  usage?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
  error?: string;
}

async function recordCall(rec: CallRecord) {
  try {
    await db.insert(llm_calls).values({
      date: todayKey(),
      user_id: rec.userId,
      model: rec.model,
      agent: rec.agent,
      input_tokens: rec.usage?.promptTokenCount ?? null,
      output_tokens: rec.usage?.candidatesTokenCount ?? null,
      latency_ms: rec.latencyMs,
      error: rec.error ?? null,
    });
  } catch {
    // Telemetry table may not exist yet (e.g. before db:push). Swallow silently.
  }
}

export type { Content, FunctionCall, FunctionDeclaration, GenerateContentResponse };
