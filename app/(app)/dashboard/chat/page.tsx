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
// Includes legacy specialist agent_types so historical rows (pre-coach
// migration) still render with the badge they originally shipped under.
const KNOWN_AGENTS: AgentKey[] = [
  "coach",
  "trainer",
  "nutritionist",
  "meal_designer",
  "reporter",
  "orchestrator",
];

function asAgent(value: string): AgentKey {
  return (KNOWN_AGENTS as string[]).includes(value)
    ? (value as AgentKey)
    : "coach";
}

// Old multi-agent dispatch wrote one copy of the user message under each
// specialist's agent_type, producing N consecutive identical user bubbles
// on reload. Pre-migration rows still need to be folded; post-migration
// every chat turn is a single coach row so this is a no-op for new data.
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
      .limit(100)
      .catch(() => []),
    getLang(),
  ]);

  const visibleRows = rows.filter((r) => VISIBLE_ROLES.has(r.role));
  const mapped: HiFiChatMessageData[] = visibleRows
    .slice()
    .reverse()
    .map((r) => {
      // runAgent attaches tool events to the assistant row directly so
      // tool cards (e.g. propose_plan_bulk's Apply/Reject) can re-render
      // when the user reloads the chat. Legacy "tool" rows from older
      // dispatch paths are filtered out by VISIBLE_ROLES above.
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
  // 5 minutes, the coach call is probably still in flight server-side.
  // The window is generous so a slow Kimi K2.6 reasoning round
  // (200-900s) still shows the "..." indicator instead of looking
  // abandoned.
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
        agent: "coach",
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
        initialDraft={initialDraft}
        lang={lang}
      />
    </>
  );
}
