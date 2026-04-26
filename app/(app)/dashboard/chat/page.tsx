import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { and, desc, eq, inArray } from "drizzle-orm";
import { AppBar } from "@/components/hifi";
import { HiFiChatPanel, type HiFiChatMessageData } from "@/components/chat/hifi-chat-panel";
import type { AgentKey } from "@/components/chat/hifi-agent-badge";
import type { ToolEvent } from "@/components/chat/hifi-tool-card";
import { getUser } from "@/lib/db/queries";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import type { UserId } from "@/lib/db/schema";

const VISIBLE_ROLES = new Set(["user", "assistant"]);
const KNOWN_AGENTS: AgentKey[] = [
  "trainer",
  "nutritionist",
  "meal_designer",
  "reporter",
  "orchestrator",
];

function asAgent(value: string): AgentKey {
  return (KNOWN_AGENTS as string[]).includes(value)
    ? (value as AgentKey)
    : "orchestrator";
}

// Multi-agent dispatch: /api/chat runs each agent sequentially and each
// runAgent logs its own copy of the user message under its own agent_type
// (so per-agent conversation history stays coherent). On reload that
// produces N consecutive identical user bubbles separated by assistant
// replies. Fold them into one.
//
// Heuristic: if a user msg's content matches another user msg within the
// last 6 hops of the rendered list, it's a multi-agent dispatch
// duplicate — skip it. 6 hops covers up to 3 agents × 2 rows each, which
// is the realistic upper bound for compound-prompt routing.
function dedupMultiAgentUserMsgs(
  msgs: HiFiChatMessageData[],
): HiFiChatMessageData[] {
  const out: HiFiChatMessageData[] = [];
  const WINDOW = 6;
  for (const msg of msgs) {
    if (msg.role === "user") {
      const recent = out.slice(-WINDOW);
      const dup = recent.find(
        (m) => m.role === "user" && m.content === msg.content,
      );
      if (dup) continue;
    }
    out.push(msg);
  }
  return out;
}

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await getSession();
  if (!session.userId) return null;
  const sp = await searchParams;
  const initialDraft = sp.draft ?? "";
  const userId = session.userId as UserId;

  const [user, rows, lang] = await Promise.all([
    getUser(userId).catch(() => null),
    db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.user_id, userId))
      .orderBy(desc(schema.conversations.created_at))
      // Bumped from 40 → 100. Multi-agent dispatch writes 3 rows per agent
      // (user + tool + assistant), so a single compound prompt can be 6+ rows.
      // The conversation_archival cron now keeps this table bounded long-term,
      // so the higher limit doesn't grow unboundedly.
      .limit(100)
      .catch(() => []),
    getLang(),
  ]);

  const visibleRows = rows.filter((r) => VISIBLE_ROLES.has(r.role));
  const mapped: HiFiChatMessageData[] = visibleRows
    .slice()
    .reverse()
    .map((r) => {
      // Synthesis path attaches tool_calls directly to the assistant row
      // (single-row pattern) so the Apply/Reject card can re-render on
      // reload. Per-agent path stores tool calls on a separate "tool" row
      // which is filtered out above — those won't show their cards on
      // history reload, which is fine since their cards are mostly
      // informational.
      const toolEvents: ToolEvent[] | undefined =
        r.role === "assistant" && Array.isArray(r.tool_calls)
          ? (r.tool_calls as ToolEvent[])
          : undefined;
      return {
        id: r.id,
        role: r.role as "user" | "assistant",
        content: r.content,
        agent: r.role === "assistant" ? asAgent(r.agent_type) : undefined,
        toolEvents,
      };
    });

  // Persisted toolEvents have status frozen at synthesis time ("pending").
  // If the user already approved or rejected the plan via /dashboard/plan,
  // the chat card would still show Apply/Reject buttons on reload. Rewrite
  // each propose_plan_bulk event's data.status with the live status from
  // pending_plans so the card can initialize its decision state correctly.
  const pendingIds = new Set<string>();
  for (const m of mapped) {
    for (const ev of m.toolEvents ?? []) {
      if (ev.tool !== "propose_plan_bulk") continue;
      const pid = (ev.result?.data as { pending_id?: string } | undefined)
        ?.pending_id;
      if (typeof pid === "string") pendingIds.add(pid);
    }
  }
  const liveStatusById = new Map<string, string>();
  if (pendingIds.size > 0) {
    const idArr = [...pendingIds];
    const statusRows = await db
      .select({
        id: schema.pending_plans.id,
        status: schema.pending_plans.status,
      })
      .from(schema.pending_plans)
      .where(
        and(
          eq(schema.pending_plans.user_id, userId),
          inArray(schema.pending_plans.id, idArr),
        ),
      )
      .catch(() => []);
    for (const r of statusRows) liveStatusById.set(r.id, r.status);
  }
  for (const m of mapped) {
    if (!m.toolEvents) continue;
    m.toolEvents = m.toolEvents.map((ev) => {
      if (ev.tool !== "propose_plan_bulk") return ev;
      const baseData =
        (ev.result?.data as Record<string, unknown> | null | undefined) ?? {};
      const pid =
        typeof baseData.pending_id === "string" ? baseData.pending_id : null;
      if (!pid) return ev;
      const liveStatus = liveStatusById.get(pid);
      // If the row is no longer in pending_plans (rare — only on explicit
      // deletion), keep the frozen "pending" status. The user might get a
      // "not found" toast on click, which is honest. Don't fabricate a
      // resolution we can't verify.
      if (!liveStatus || liveStatus === baseData.status) return ev;
      return {
        ...ev,
        result: {
          ...ev.result,
          data: { ...baseData, status: liveStatus },
        },
      };
    });
  }

  let initial = dedupMultiAgentUserMsgs(mapped);

  // If the most recent persisted row is a user message from the last
  // 5 minutes, an LLM call is probably still in flight server-side
  // (most commonly the synthesis path, which can take 15-30s; the
  // window is generous so a slow cold-started Render container or a
  // Kimi K2.6 reasoning round still shows the "..." indicator instead
  // of looking abandoned).
  const PENDING_WINDOW_MS = 5 * 60 * 1000;
  const latestVisible = visibleRows[0];
  if (
    latestVisible &&
    latestVisible.role === "user" &&
    Date.now() - new Date(latestVisible.created_at).getTime() < PENDING_WINDOW_MS
  ) {
    initial = [
      ...initial,
      {
        id: `pending-${latestVisible.id}`,
        role: "assistant",
        content: "",
        pending: true,
        agent: "orchestrator",
      },
    ];
  }

  return (
    <>
      <AppBar
        eyebrow={user?.goal ? user.goal.slice(0, 60) : undefined}
        title={t("chat", lang)}
      />
      <HiFiChatPanel
        initialMessages={initial}
        defaultAgent="auto"
        initialDraft={initialDraft}
        lang={lang}
      />
    </>
  );
}
