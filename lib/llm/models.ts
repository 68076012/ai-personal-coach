export type ModelTier = "pro" | "flash" | "flash-lite" | "kimi";

// Display IDs. For Kimi, the actual API model id is configurable via
// MOONSHOT_MODEL env (default "kimi-k2.6").
export const GEMINI_MODEL: Record<ModelTier, string> = {
  pro: "gemini-2.5-pro",
  flash: "gemini-2.5-flash",
  "flash-lite": "gemini-2.5-flash-lite",
  kimi: process.env.MOONSHOT_MODEL ?? "kimi-k2.6",
};

// Kimi sits at the end of every Gemini chain as a paid last-resort.
export const FALLBACK_CHAIN: Record<ModelTier, ModelTier[]> = {
  pro: ["pro", "flash", "flash-lite", "kimi"],
  flash: ["flash", "flash-lite", "kimi"],
  "flash-lite": ["flash-lite", "kimi"],
  kimi: ["kimi"],
};

export const DAILY_CALL_CAP: Record<ModelTier, number> = {
  pro: 90,
  flash: 230,
  "flash-lite": 950,
  // Paid balance pre-loaded on Moonshot — typical chat call is ~$0.001-0.003,
  // so the topped-up balance covers thousands of calls/month. Cap removed; the
  // billing console is the real backstop. Use Infinity as sentinel so the cap
  // check + admin progress bar treat it as "no limit".
  kimi: Number.POSITIVE_INFINITY,
};

export function isKimiTier(tier: ModelTier): boolean {
  return tier === "kimi";
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

export function chooseModel(opts: CallOptions): ModelTier {
  if (opts.agent === "reporter") return "pro";
  if (opts.task === "route") return "flash-lite";
  if (opts.task === "log") return "flash-lite";
  if (opts.task === "plan") return "pro";
  if (opts.estimatedComplexity === "high") return "pro";
  return "flash";
}
