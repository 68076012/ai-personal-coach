export type ModelTier = "kimi";

// Display IDs. The actual API model id for `kimi` is configurable via
// MOONSHOT_MODEL env (default "kimi-k2.6").
export const MODEL_ID: Record<ModelTier, string> = {
  kimi: process.env.MOONSHOT_MODEL ?? "kimi-k2.6",
};

// k2.6 has no fallback — if Moonshot's reasoning model is down, the call
// fails and the route surfaces the error to the user.
export const FALLBACK_CHAIN: Record<ModelTier, ModelTier[]> = {
  kimi: ["kimi"],
};

// "coach" handles every chat message (one general agent with all tools).
// trainer / meal_designer remain because the nightly-plan cron drives them
// directly to compose tomorrow's plan without going through chat. reporter
// is invoked by the morning-report cron.
export type AgentName =
  | "coach"
  | "trainer"
  | "meal_designer"
  | "reporter";

export type Task = "route" | "log" | "chat" | "plan" | "report";
