// The app runs on a single Moonshot reasoning model — Kimi K2.6.
// `ModelTier` stays as a one-member union (rather than dropping the type
// entirely) so callers like `runAgent({ overrideTier })` keep their existing
// signatures and we can re-introduce more tiers later without touching them.
export type ModelTier = "kimi";

// Actual API model id is configurable via MOONSHOT_MODEL env (default
// "kimi-k2.6") to accommodate alias drift on the Moonshot side.
export const MODEL_ID: Record<ModelTier, string> = {
  kimi: process.env.MOONSHOT_MODEL ?? "kimi-k2.6",
};

export type AgentName =
  | "orchestrator"
  | "trainer"
  | "nutritionist"
  | "meal_designer"
  | "reporter";

// Kept on `RunAgentInput` for documentation purposes and so the cron jobs
// (which still tag their calls with task/complexity hints) keep type-checking
// even though the LLM call itself no longer branches on them.
export type Task = "route" | "log" | "chat" | "plan" | "report";
