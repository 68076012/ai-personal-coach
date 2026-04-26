import { sql } from "drizzle-orm";
import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">วันนี้: {today}</p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Gemini API วันนี้</CardTitle>
        </CardHeader>
        <CardContent>
          {usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีการเรียก</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left">Model</th>
                  <th className="py-1 text-right">Calls</th>
                  <th className="py-1 text-right">Errors</th>
                  <th className="py-1 text-right">In/Out tokens</th>
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => {
                  const tier = u.model.includes("pro")
                    ? "pro"
                    : u.model.includes("lite")
                      ? "flash-lite"
                      : "flash";
                  const cap = DAILY_CALL_CAP[tier as keyof typeof DAILY_CALL_CAP];
                  const pct = cap ? Math.round((u.total / cap) * 100) : null;
                  return (
                    <tr key={u.model} className="border-t">
                      <td className="py-1.5 font-mono text-xs">{u.model}</td>
                      <td className="py-1.5 text-right tabular-nums">
                        {u.total}
                        {pct !== null && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            ({pct}% of {cap})
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        <span className={u.errors > 0 ? "text-rose-600" : ""}>
                          {u.errors}
                        </span>
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-xs">
                        {u.inputTokens.toLocaleString()} /{" "}
                        {u.outputTokens.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Agents</CardTitle>
          <p className="text-xs text-muted-foreground">
            Read-only — แสดง agent ทั้งหมดในระบบ พร้อม tools และจำนวน call วันนี้
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {agentRows.map((a) => (
              <li key={a.name} className="rounded-md border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-semibold">{a.label}</span>
                      <span className="font-mono text-xs text-muted-foreground">{a.name}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                  </div>
                  <div className="shrink-0 text-right text-xs">
                    <div className="tabular-nums">
                      <span className="font-medium">{a.calls}</span>
                      <span className="text-muted-foreground"> calls</span>
                      {a.errors > 0 && (
                        <span className="ml-1 text-rose-600">· {a.errors} err</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">{a.defaultTier}</div>
                  </div>
                </div>
                {a.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.tools.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">DB row counts</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {counts.map((c) => (
              <li key={c.name} className="flex justify-between rounded-md border px-2 py-1.5">
                <span className="font-mono text-xs">{c.name}</span>
                <span className="tabular-nums">{c.count >= 0 ? c.count : "—"}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
