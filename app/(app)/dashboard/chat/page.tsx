import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { desc, eq } from "drizzle-orm";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatMessageData } from "@/components/chat/chat-message";
import type { AgentKey } from "@/components/chat/agent-badge";

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

  const rows = await db
    .select()
    .from(schema.conversations)
    .where(eq(schema.conversations.user_id, session.userId))
    .orderBy(desc(schema.conversations.created_at))
    .limit(40)
    .catch(() => []);

  const initial: ChatMessageData[] = rows
    .filter((r) => VISIBLE_ROLES.has(r.role))
    .reverse()
    .map((r) => ({
      id: r.id,
      role: r.role as "user" | "assistant",
      content: r.content,
      agent: r.role === "assistant" ? asAgent(r.agent_type) : undefined,
    }));

  return (
    <div className="flex flex-1 flex-col">
      <ChatPanel initialMessages={initial} defaultAgent="auto" initialDraft={initialDraft} />
    </div>
  );
}
