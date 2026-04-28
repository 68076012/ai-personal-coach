import { db } from "@/lib/db/client";
import { llm_calls } from "@/lib/db/schema";
import { FALLBACK_CHAIN, MODEL_ID, type ModelTier } from "./models";
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

export type LLMChainKind =
  // Kept the legacy union so callers (chat route's CHAIN_USER_MESSAGE map)
  // don't need a separate migration. Now there's effectively only one
  // failure shape: Kimi was unreachable / overloaded.
  | "kimi_overload"
  | "all_failed";

export class LLMChainError extends Error {
  kind: LLMChainKind;
  attempts: ChainAttempt[];
  constructor(kind: LLMChainKind, attempts: ChainAttempt[]) {
    const last = attempts[attempts.length - 1];
    super(
      `[llm] chain ${kind}: ${attempts.map((a) => `${a.tier}=${a.cause}`).join(" → ")}` +
        (last ? ` (last: ${last.error.slice(0, 160)})` : ""),
    );
    this.name = "LLMChainError";
    this.kind = kind;
    this.attempts = attempts;
  }
}

function classifyChainResult(attempts: ChainAttempt[]): LLMChainKind {
  if (attempts.length === 0) return "all_failed";
  const last = attempts[attempts.length - 1];
  if (last.cause === "rate_limit" || last.cause === "overloaded" || last.cause === "server_error") {
    return "kimi_overload";
  }
  return "all_failed";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CallParams {
  tier: ModelTier;
  systemInstruction: string;
  contents: Content[];
  tools?: FunctionDeclaration[];
  agent?: string;
  userId?: string | null;
  // Accepted for API compatibility with the previous Gemini-aware client —
  // ignored on Moonshot, which doesn't expose a thinking budget knob.
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

// Single LLM entry point. Walks FALLBACK_CHAIN[tier] (e.g. kimi-fast → kimi)
// and retries the last tier once on transient errors before giving up.
export async function callLLM(
  params: CallParams,
): Promise<GenerateContentResponse> {
  const chain = FALLBACK_CHAIN[params.tier];
  const attempts: ChainAttempt[] = [];

  for (const tier of chain) {
    let result = await attemptCall(tier, params);
    if (result.ok) return result.res;

    const transient = classifyTransient(result.err);
    const errMsg = result.err instanceof Error ? result.err.message : String(result.err);
    const isLast = tier === chain[chain.length - 1];

    // Retry once on the LAST tier if it's transient — gives Moonshot a brief
    // moment to clear engine overload before we surface the error.
    if (transient && isLast) {
      attempts.push({ tier, model: MODEL_ID[tier], cause: transient, error: errMsg, retried: true });
      console.warn(`[llm] ${tier} ${transient} on last tier, retrying once after 2s`);
      await sleep(2000);
      result = await attemptCall(tier, params);
      if (result.ok) return result.res;
      const retryMsg = result.err instanceof Error ? result.err.message : String(result.err);
      const retryCause = classifyTransient(result.err) ?? "fatal";
      attempts.push({ tier, model: MODEL_ID[tier], cause: retryCause, error: retryMsg, retried: true });
      throw new LLMChainError(classifyChainResult(attempts), attempts);
    }

    if (transient) {
      console.warn(`[llm] ${tier} ${transient}, trying next tier`);
      attempts.push({ tier, model: MODEL_ID[tier], cause: transient, error: errMsg });
      continue;
    }

    // Non-transient (auth, bad request, missing API key) — fail immediately.
    attempts.push({ tier, model: MODEL_ID[tier], cause: "fatal", error: errMsg });
    throw new LLMChainError(classifyChainResult(attempts), attempts);
  }

  throw new LLMChainError(classifyChainResult(attempts), attempts);
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
