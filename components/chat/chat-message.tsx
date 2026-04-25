import Link from "next/link";
import { CalendarCheck, ExternalLink, UtensilsCrossed } from "lucide-react";
import { AgentBadge, type AgentKey } from "./agent-badge";

export interface ToolEvent {
  tool: string;
  args?: unknown;
  result: { ok: boolean; data?: unknown; error?: string };
}

export interface ChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: AgentKey;
  pending?: boolean;
  toolEvents?: ToolEvent[];
}

function getDate(args: unknown): string | null {
  if (args && typeof args === "object" && "date" in args) {
    const v = (args as { date?: unknown }).date;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  return null;
}

function getMealCount(args: unknown): number | null {
  if (args && typeof args === "object" && "meals" in args) {
    const m = (args as { meals?: unknown }).meals;
    if (Array.isArray(m)) return m.length;
  }
  if (args && typeof args === "object" && "meal_plan" in args) {
    const m = (args as { meal_plan?: unknown }).meal_plan;
    if (Array.isArray(m)) return m.length;
  }
  return null;
}

function SavedMenuPill({ event }: { event: ToolEvent }) {
  const date = getDate(event.args);
  const count = getMealCount(event.args);
  if (!event.result.ok) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-xs">
      <UtensilsCrossed className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      <span>
        บันทึกเมนู
        {count ? ` ${count} รายการ` : ""}
        {date ? ` เข้าแผนวัน ${date}` : ""}
      </span>
      <Link
        href={date ? `/dashboard/plan?date=${date}` : "/dashboard/plan"}
        className="ml-auto inline-flex items-center gap-0.5 font-medium text-emerald-700 hover:underline dark:text-emerald-300"
      >
        ดูแผน <ExternalLink className="size-3" />
      </Link>
    </div>
  );
}

function PlanUpdatedPill({ event }: { event: ToolEvent }) {
  const date = getDate(event.args);
  if (!event.result.ok) return null;
  return (
    <div className="flex items-center gap-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1.5 text-xs">
      <CalendarCheck className="size-3.5 text-violet-600 dark:text-violet-400" />
      <span>อัพเดทแผน{date ? `วัน ${date}` : ""}แล้ว</span>
      <Link
        href={date ? `/dashboard/plan?date=${date}` : "/dashboard/plan"}
        className="ml-auto inline-flex items-center gap-0.5 font-medium text-violet-700 hover:underline dark:text-violet-300"
      >
        ดูแผน <ExternalLink className="size-3" />
      </Link>
    </div>
  );
}

export function ChatMessage({ message }: { message: ChatMessageData }) {
  const isUser = message.role === "user";

  const richEvents = (message.toolEvents ?? []).filter(
    (t) => t.tool === "propose_meals" || t.tool === "update_plan",
  );
  const otherEvents = (message.toolEvents ?? []).filter(
    (t) => t.tool !== "propose_meals" && t.tool !== "update_plan",
  );

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[85%] space-y-1.5 ${isUser ? "items-end" : "items-start"} flex flex-col`}>
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
        {richEvents.length > 0 && (
          <div className="w-full space-y-1.5">
            {richEvents.map((t, i) =>
              t.tool === "propose_meals" ? (
                <SavedMenuPill key={i} event={t} />
              ) : (
                <PlanUpdatedPill key={i} event={t} />
              ),
            )}
          </div>
        )}
        {otherEvents.length > 0 && (
          <div className="space-y-0.5 text-xs text-muted-foreground">
            {otherEvents.map((t, i) => (
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
