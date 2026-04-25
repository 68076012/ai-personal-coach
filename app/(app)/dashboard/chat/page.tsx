import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { desc, eq } from "drizzle-orm";
import { ChatPanel } from "@/components/chat/chat-panel";
import { GoalPill } from "@/components/chat/goal-pill";
import { getUser } from "@/lib/db/queries";
import type { ChatMessageData } from "@/components/chat/chat-message";
import type { AgentKey } from "@/components/chat/agent-badge";
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

  const [user, rows] = await Promise.all([
    getUser(userId).catch(() => null),
    db
      .select()
      .from(schema.conversations)
      .where(eq(schema.conversations.user_id, userId))
      .orderBy(desc(schema.conversations.created_at))
      .limit(40)
      .catch(() => []),
  ]);

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
      <GoalPill
        goal={user?.goal ?? null}
        goalKcal={user?.goal_kcal ?? null}
        goalProtein={user?.goal_protein_g ?? null}
      />
      <ChatPanel initialMessages={initial} defaultAgent="auto" initialDraft={initialDraft} />
    </div>
  );
}
