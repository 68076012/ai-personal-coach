export type ModelTier = "pro" | "flash" | "flash-lite";

export const GEMINI_MODEL: Record<ModelTier, string> = {
  pro: "gemini-2.5-pro",
  flash: "gemini-2.5-flash",
  "flash-lite": "gemini-2.5-flash-lite",
};

export const FALLBACK_CHAIN: Record<ModelTier, ModelTier[]> = {
  pro: ["pro", "flash", "flash-lite"],
  flash: ["flash", "flash-lite"],
  "flash-lite": ["flash-lite"],
};

export const DAILY_CALL_CAP: Record<ModelTier, number> = {
  pro: 90,
  flash: 230,
  "flash-lite": 950,
};

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
