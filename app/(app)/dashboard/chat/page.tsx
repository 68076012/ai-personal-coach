import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { desc, eq } from "drizzle-orm";
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

  const mapped: HiFiChatMessageData[] = rows
    .filter((r) => VISIBLE_ROLES.has(r.role))
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
  const initial = dedupMultiAgentUserMsgs(mapped);

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
