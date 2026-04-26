import { sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { AppBar, HiFiCard, Bar } from "@/components/hifi";
import { DAILY_CALL_CAP, type AgentName } from "@/lib/llm/models";
import { declarationsForAgent } from "@/lib/llm/tools";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

interface ModelUsage {
  model: string;
  total: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
}

export default async function AdminPage() {
  const session = await getSession();
  if (!session.userId) return null;

  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");

  const usage = await db
    .select({
      model: schema.llm_calls.model,
      total: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${schema.llm_calls.error} is not null)::int`,
      inputTokens: sql<number>`coalesce(sum(${schema.llm_calls.input_tokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${schema.llm_calls.output_tokens}), 0)::int`,
    })
    .from(schema.llm_calls)
    .where(sql`${schema.llm_calls.date} = ${today}`)
    .groupBy(schema.llm_calls.model)
    .catch((): ModelUsage[] => []);

  const agentUsage = await db
    .select({
      agent: schema.llm_calls.agent,
      total: sql<number>`count(*)::int`,
      errors: sql<number>`count(*) filter (where ${schema.llm_calls.error} is not null)::int`,
    })
    .from(schema.llm_calls)
    .where(sql`${schema.llm_calls.date} = ${today}`)
    .groupBy(schema.llm_calls.agent)
    .catch(() => [] as { agent: string | null; total: number; errors: number }[]);

  const usageByAgent = new Map<string, { total: number; errors: number }>(
    agentUsage
      .filter((u): u is { agent: string; total: number; errors: number } => u.agent !== null)
      .map((u) => [u.agent, { total: u.total, errors: u.errors }]),
  );

  const AGENTS: { name: AgentName; label: string; defaultTier: string; description: string }[] = [
    { name: "orchestrator", label: "Orchestrator", defaultTier: "flash-lite", description: "Intent router — ตัดสินว่าข้อความเข้าหา agent ไหน" },
    { name: "trainer", label: "Trainer", defaultTier: "flash", description: "Workout, form, programming, sport-specific" },
    { name: "nutritionist", label: "Nutritionist", defaultTier: "flash", description: "Macro/calorie tracking, อาหารไทย" },
    { name: "meal_designer", label: "Meal Designer", defaultTier: "flash → pro (plan)", description: "วางเมนู, recipe, grocery" },
    { name: "reporter", label: "Reporter", defaultTier: "pro", description: "สรุปเช้า + คำถาม coaching" },
  ];

  const agentRows = AGENTS.map((a) => {
    const tools = declarationsForAgent(a.name).map((d) => d.name).filter(Boolean) as string[];
    const usage = usageByAgent.get(a.name);
    return { ...a, tools, calls: usage?.total ?? 0, errors: usage?.errors ?? 0 };
  });

  const counts = await Promise.all(
    [
      ["users", schema.users],
      ["meals", schema.meals],
      ["workouts", schema.workouts],
      ["daily_plans", schema.daily_plans],
      ["agent_memory", schema.agent_memory],
      ["conversations", schema.conversations],
      ["morning_reports", schema.morning_reports],
      ["llm_calls", schema.llm_calls],
    ].map(async ([name, table]) => {
      const r = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(table as never)
        .catch(() => [{ c: -1 }]);
      return { name: name as string, count: r[0]?.c ?? 0 };
    }),
  );

  return (
    <>
      <AppBar
        eyebrow={`วันนี้: ${today}`}
        title="Admin"
      />
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 space-y-3">
        {/* Quota / API usage with progress bars */}
        <HiFiCard className="p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            LLM API · วันนี้
          </div>
          {usage.length === 0 ? (
            <p className="text-sm text-[var(--ink-3)]">ยังไม่มีการเรียก</p>
          ) : (
            <div className="space-y-3">
              {usage.map((u) => {
                const tier = u.model.includes("kimi") || u.model.includes("moonshot")
                  ? "kimi"
                  : u.model.includes("pro")
                    ? "pro"
                    : u.model.includes("lite")
                      ? "flash-lite"
                      : "flash";
                const cap = DAILY_CALL_CAP[tier as keyof typeof DAILY_CALL_CAP];
                const pct = cap ? Math.round((u.total / cap) * 100) : null;
                const barColor =
                  pct !== null && pct >= 80 ? "coral" : pct !== null && pct >= 50 ? "sun" : "leaf";
                return (
                  <div key={u.model} className="space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="font-mono text-xs text-[var(--ink-2)]">{u.model}</span>
                      <span className="tabular text-xs text-[var(--ink-3)]">
                        <b className="text-[var(--ink)] font-semibold">{u.total}</b>
                        {cap && ` / ${cap}`}
                        {u.errors > 0 && (
                          <span className="ml-1.5 text-[var(--coral)]">· {u.errors} err</span>
                        )}
                      </span>
                    </div>
                    {cap && <Bar value={u.total} max={cap} color={barColor} />}
                    <div className="text-[10px] text-[var(--ink-3)] tabular">
                      tokens {u.inputTokens.toLocaleString()} in /{" "}
                      {u.outputTokens.toLocaleString()} out
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </HiFiCard>

        {/* Agents */}
        <HiFiCard className="p-4 space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Agents
            </div>
            <p className="text-xs text-[var(--ink-3)] mt-1">
              Read-only — agent ทั้งหมดในระบบ พร้อม tools และ call วันนี้
            </p>
          </div>
          <ul className="space-y-2">
            {agentRows.map((a) => (
              <li
                key={a.name}
                className="rounded-[12px] border border-[var(--line)] bg-[var(--surface-2)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold text-[var(--ink)]">{a.label}</span>
                      <span className="font-mono text-[10px] text-[var(--ink-3)]">{a.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-[var(--ink-3)]">{a.description}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="tabular">
                      <span className="font-semibold text-[var(--ink)]">{a.calls}</span>
                      <span className="text-[var(--ink-3)]"> calls</span>
                      {a.errors > 0 && (
                        <span className="ml-1 text-[var(--coral)]">· {a.errors} err</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--ink-3)] mt-0.5">
                      {a.defaultTier}
                    </div>
                  </div>
                </div>
                {a.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tools.map((t) => (
                      <span
                        key={t}
                        className="rounded-md bg-[var(--surface)] border border-[var(--line)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-2)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </HiFiCard>

        {/* DB row counts */}
        <HiFiCard className="p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            DB row counts
          </div>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {counts.map((c) => (
              <li
                key={c.name}
                className="flex items-baseline justify-between rounded-[10px] border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1.5"
              >
                <span className="font-mono text-[11px] text-[var(--ink-2)]">{c.name}</span>
                <span className="tabular text-sm font-semibold text-[var(--ink)]">
                  {c.count >= 0 ? c.count : "—"}
                </span>
              </li>
            ))}
          </ul>
        </HiFiCard>
      </div>
    </>
  );
}
