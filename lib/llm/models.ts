export type ModelTier = "kimi" | "kimi-fast";

// Display IDs. The actual API model id for `kimi` is configurable via
// MOONSHOT_MODEL env (default "kimi-k2.6"). `kimi-fast` pins to the
// non-reasoning Moonshot model — useful when latency matters more than
// reasoning depth (e.g., chat that needs to fit a serverless timeout
// budget). Both tiers bill against the same Moonshot balance.
export const MODEL_ID: Record<ModelTier, string> = {
  kimi: process.env.MOONSHOT_MODEL ?? "kimi-k2.6",
  "kimi-fast": "moonshot-v1-32k",
};

// kimi-fast falls back to k2.6 if the non-reasoning endpoint is unavailable.
// k2.6 has no fallback — if Moonshot's reasoning model is down, the call
// fails and the route surfaces the error to the user.
export const FALLBACK_CHAIN: Record<ModelTier, ModelTier[]> = {
  kimi: ["kimi"],
  "kimi-fast": ["kimi-fast", "kimi"],
};

export function isKimiTier(tier: ModelTier): boolean {
  return tier === "kimi" || tier === "kimi-fast";
}

export type AgentName =
  | "orchestrator"
  | "trainer"
  | "nutritionist"
  | "meal_designer"
  | "reporter";

export type Task = "route" | "log" | "chat" | "plan" | "report";

export interface CallOptions {
  agent: AgentName;
  task: Task;
  hasTools: boolean;
  estimatedComplexity?: "low" | "medium" | "high";
}

// Default tier picker. Reasoning-heavy work (reports, planning, complex
// chat with high complexity) gets k2.6; everything else uses kimi-fast for
// snappier round-trips. Users can override per request via the model
// selector in the chat composer.
export function chooseModel(opts: CallOptions): ModelTier {
  if (opts.agent === "reporter") return "kimi";
  if (opts.task === "plan") return "kimi";
  if (opts.estimatedComplexity === "high") return "kimi";
  return "kimi-fast";
}
