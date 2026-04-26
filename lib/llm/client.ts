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

function classifyTransient(err: unknown): "rate_limit" | "overloaded" | "server_error" | null {
  const e = err as { status?: number; message?: string; code?: number };
  if (!e) return null;
  const code = e.status ?? e.code;
  const msg = e.message ?? "";
  if (code === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(msg)) return "rate_limit";
  if (code === 503 || /503|UNAVAILABLE|overloaded|high demand/i.test(msg)) return "overloaded";
  if (code === 500 || code === 502 || code === 504) return "server_error";
  return null;
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

export async function callGemini(
  params: CallParams,
): Promise<GenerateContentResponse> {
  const chain = FALLBACK_CHAIN[params.tier];
  let lastError: unknown = null;

  for (const tier of chain) {
    const used = incrementCount(tier);
    if (used > DAILY_CALL_CAP[tier]) {
      console.warn(
        `[llm] daily cap reached for ${tier} (${used}/${DAILY_CALL_CAP[tier]}); falling through`,
      );
      continue;
    }
    const startedAt = Date.now();
    try {
      const res = isKimiTier(tier)
        ? await callKimi({
            systemInstruction: params.systemInstruction,
            contents: params.contents,
            tools: params.tools,
            temperature: 0.7,
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

      return res;
    } catch (err) {
      lastError = err;
      const latency = Date.now() - startedAt;
      void recordCall({
        model: GEMINI_MODEL[tier],
        agent: params.agent,
        userId: params.userId ?? null,
        latencyMs: latency,
        error: err instanceof Error ? err.message : String(err),
      });
      const transient = classifyTransient(err);
      if (transient && tier !== chain[chain.length - 1]) {
        console.warn(`[llm] ${tier} ${transient}, trying next tier`);
        continue;
      }
      throw err;
    }
  }
  throw new Error(
    `[llm] all tiers exhausted. Last: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
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
