import {
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentResponse,
} from "@google/genai";
import { db } from "@/lib/db/client";
import { llm_calls } from "@/lib/db/schema";
import {
  DAILY_CALL_CAP,
  FALLBACK_CHAIN,
  GEMINI_MODEL,
  isKimiTier,
  type ModelTier,
} from "./models";
import { callKimi } from "./kimi";

let cachedClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_API_KEY is not set. Add it to .env.local before calling Gemini.",
    );
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

const callCounts: Map<string, number> = new Map();
function incrementCount(model: ModelTier): number {
  const key = `${todayKey()}:${model}`;
  const next = (callCounts.get(key) ?? 0) + 1;
  callCounts.set(key, next);
  return next;
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
  cause: TransientCause | "cap_reached" | "fatal";
  error: string;
  retried?: boolean;
}

export type LLMChainKind =
  | "gemini_quota"   // every Gemini tier 429'd; Kimi was unreachable or unavailable
  | "kimi_overload"  // Gemini exhausted, Kimi was reached but transient (429/503)
  | "all_failed";    // catch-all for genuinely terminal errors (auth, bad request, no api key)

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

  // If Kimi was the final attempt and it failed transient → engine overload, not user quota.
  if (last.tier === "kimi" && (last.cause === "overloaded" || last.cause === "rate_limit" || last.cause === "server_error")) {
    return "kimi_overload";
  }

  // Kimi never reached (or fatal) and every Gemini attempt was rate-limited/cap → genuine Gemini quota.
  const onlyGeminiQuota = attempts.every(
    (a) => a.tier !== "kimi" && (a.cause === "rate_limit" || a.cause === "cap_reached"),
  );
  if (onlyGeminiQuota) return "gemini_quota";

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
  thinkingBudget?: number;
}

async function attemptCall(
  tier: ModelTier,
  params: CallParams,
): Promise<{ ok: true; res: GenerateContentResponse } | { ok: false; err: unknown; latencyMs: number }> {
  const startedAt = Date.now();
  try {
    const res = isKimiTier(tier)
      ? await callKimi({
          systemInstruction: params.systemInstruction,
          contents: params.contents,
          tools: params.tools,
        })
      : await getClient().models.generateContent({
          model: GEMINI_MODEL[tier],
          contents: params.contents,
          config: {
            systemInstruction: params.systemInstruction,
            tools: params.tools?.length
              ? [{ functionDeclarations: params.tools }]
              : undefined,
            temperature: 0.7,
            ...(params.thinkingBudget !== undefined && {
              thinkingConfig: { thinkingBudget: params.thinkingBudget },
            }),
          },
        });
    void recordCall({
      model: GEMINI_MODEL[tier],
      agent: params.agent,
      userId: params.userId ?? null,
      latencyMs: Date.now() - startedAt,
      usage: res.usageMetadata,
    });
    return { ok: true, res };
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    void recordCall({
      model: GEMINI_MODEL[tier],
      agent: params.agent,
      userId: params.userId ?? null,
      latencyMs,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, err, latencyMs };
  }
}

export async function callGemini(
  params: CallParams,
): Promise<GenerateContentResponse> {
  const chain = FALLBACK_CHAIN[params.tier];
  const attempts: ChainAttempt[] = [];

  for (const tier of chain) {
    const used = incrementCount(tier);
    const cap = DAILY_CALL_CAP[tier];
    if (Number.isFinite(cap) && used > cap) {
      console.warn(
        `[llm] daily cap reached for ${tier} (${used}/${cap}); falling through`,
      );
      attempts.push({
        tier,
        model: GEMINI_MODEL[tier],
        cause: "cap_reached",
        error: `daily cap (${cap}) reached`,
      });
      continue;
    }

    let result = await attemptCall(tier, params);
    if (result.ok) return result.res;

    const transient = classifyTransient(result.err);
    const errMsg = result.err instanceof Error ? result.err.message : String(result.err);
    const isLast = tier === chain[chain.length - 1];

    // Retry once on the LAST tier if it's transient — gives Moonshot/Kimi
    // a brief moment to clear engine overload before we give up.
    if (transient && isLast) {
      attempts.push({ tier, model: GEMINI_MODEL[tier], cause: transient, error: errMsg, retried: true });
      console.warn(`[llm] ${tier} ${transient} on last tier, retrying once after 2s`);
      await sleep(2000);
      result = await attemptCall(tier, params);
      if (result.ok) return result.res;
      const retryMsg = result.err instanceof Error ? result.err.message : String(result.err);
      const retryCause = classifyTransient(result.err) ?? "fatal";
      attempts.push({ tier, model: GEMINI_MODEL[tier], cause: retryCause, error: retryMsg, retried: true });
      throw new LLMChainError(classifyChainResult(attempts), attempts);
    }

    if (transient) {
      console.warn(`[llm] ${tier} ${transient}, trying next tier`);
      attempts.push({ tier, model: GEMINI_MODEL[tier], cause: transient, error: errMsg });
      continue;
    }

    // Non-transient (auth, bad request, missing API key) → fail immediately, don't bury the cause.
    attempts.push({ tier, model: GEMINI_MODEL[tier], cause: "fatal", error: errMsg });
    throw new LLMChainError(classifyChainResult(attempts), attempts);
  }

  // Loop ended via continues — every tier hit cap or transient w/o last-tier rescue.
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
