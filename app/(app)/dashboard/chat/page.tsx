import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { desc, eq } from "drizzle-orm";
import { AppBar } from "@/components/hifi";
import { HiFiChatPanel, type HiFiChatMessageData } from "@/components/chat/hifi-chat-panel";
import type { AgentKey } from "@/components/chat/hifi-agent-badge";
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
      .limit(40)
      .catch(() => []),
    getLang(),
  ]);

  const initial: HiFiChatMessageData[] = rows
    .filter((r) => VISIBLE_ROLES.has(r.role))
    .reverse()
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      agent: r.role === "assistant" ? asAgent(r.agent_type) : undefined,
    }));

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
