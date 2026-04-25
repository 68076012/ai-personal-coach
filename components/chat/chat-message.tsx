import { AgentBadge, type AgentKey } from "./agent-badge";

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: AgentKey;
  pending?: boolean;
  toolEvents?: { tool: string; result: { ok: boolean; data?: unknown; error?: string } }[];
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-1 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
        {!isUser && message.agent && <AgentBadge agent={message.agent} />}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-muted rounded-bl-md"
          }`}
        >
          {message.pending ? (
            <span className="inline-flex gap-1">
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current" />
            </span>
          ) : (
            message.content
          )}
        </div>
        {message.toolEvents && message.toolEvents.length > 0 && (
          <div className="text-xs text-muted-foreground space-y-0.5">
            {message.toolEvents.map((t, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className={t.result.ok ? "text-emerald-600" : "text-red-600"}>
                  {t.result.ok ? "✓" : "✗"}
                </span>
                <span>{t.tool}</span>
                {t.result.error && <span className="text-red-600">— {t.result.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
