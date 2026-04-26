"use client";

import * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Send, Sparkles, Square } from "lucide-react";
import { toast } from "sonner";
import { HiFiAgentBadge, type AgentKey } from "./hifi-agent-badge";
import { HiFiToolCard, type ToolEvent } from "./hifi-tool-card";
import { type Lang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type ModelChoice = "auto" | "pro" | "flash" | "flash-lite" | "kimi";

const MODEL_LABEL: Record<ModelChoice, string> = {
  auto: "Auto",
  pro: "Pro",
  flash: "Flash",
  "flash-lite": "Lite",
  kimi: "Kimi",
};

const MODEL_ORDER: ModelChoice[] = ["auto", "pro", "flash", "flash-lite", "kimi"];

const MODEL_STORAGE_KEY = "chat:model";

export interface HiFiChatMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: AgentKey;
  pending?: boolean;
  toolEvents?: ToolEvent[];
}

interface Props {
  initialMessages?: HiFiChatMessageData[];
  defaultAgent?: AgentKey | "auto";
  initialDraft?: string;
  lang: Lang;
}

export function HiFiChatPanel({
  initialMessages = [],
  defaultAgent = "auto",
  initialDraft = "",
  lang,
}: Props) {
  const [messages, setMessages] = useState<HiFiChatMessageData[]>(initialMessages);
  const [input, setInput] = useState(initialDraft);
  const [pending, startTransition] = useTransition();
  const [model, setModel] = useState<ModelChoice>("auto");
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Hydrate model choice from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (saved && (MODEL_ORDER as string[]).includes(saved)) {
      setModel(saved as ModelChoice);
    }
  }, []);

  // Close menu when clicking outside.
  useEffect(() => {
    if (!modelMenuOpen) return;
    function onDoc(ev: MouseEvent) {
      if (!modelMenuRef.current) return;
      if (!modelMenuRef.current.contains(ev.target as Node)) {
        setModelMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [modelMenuOpen]);

  function chooseModelChoice(next: ModelChoice) {
    setModel(next);
    setModelMenuOpen(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(MODEL_STORAGE_KEY, next);
    }
  }

  // Run after every paint so the scroll area is laid out with its real
  // height before we ask it to scroll. First paint = "auto" (instant) so
  // the user lands at the bottom immediately even when arriving with a
  // prefilled draft from another page; later updates use smooth.
  const didMount = useRef(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: didMount.current ? "smooth" : "auto",
    });
    didMount.current = true;
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || pending) return;
    const placeholderId = crypto.randomUUID();
    const userMsg: HiFiChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const placeholder: HiFiChatMessageData = {
      id: placeholderId,
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((m) => [...m, userMsg, placeholder]);
    setInput("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, agent: defaultAgent, model }),
          signal: ctrl.signal,
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.message ?? json.error ?? "request failed");
        }
        // Multi-agent dispatch: API returns { ok, replies: [{agent, reply,
        // toolEvents}, ...] }. Replace the placeholder with the first reply
        // and append the rest as fresh assistant bubbles below it.
        const replies: Array<{
          agent: AgentKey;
          reply: string;
          toolEvents: ToolEvent[];
        }> = json.replies ?? (json.reply
          ? [{ agent: json.agent, reply: json.reply, toolEvents: json.toolEvents ?? [] }]
          : []);
        if (replies.length === 0) {
          throw new Error("empty response");
        }
        setMessages((m) => {
          const out: HiFiChatMessageData[] = [];
          for (const msg of m) {
            if (msg.id !== placeholderId) {
              out.push(msg);
              continue;
            }
            // Replace placeholder with first reply, then push additional ones.
            replies.forEach((r, i) => {
              out.push({
                id: i === 0 ? placeholderId : crypto.randomUUID(),
                role: "assistant",
                pending: false,
                content: r.reply,
                agent: r.agent,
                toolEvents: r.toolEvents,
              });
            });
          }
          return out;
        });
        router.refresh();
      } catch (err) {
        const aborted = (err as { name?: string }).name === "AbortError";
        if (!aborted) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toast.error(errMsg);
        }
        setMessages((m) => m.filter((x) => x.id !== placeholderId));
      } finally {
        abortRef.current = null;
      }
    });
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function onKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      {/* Scroll area — flex-1 + min-h-0 so it fills the remaining height
          inside main's flex column, instead of collapsing to its content. */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-3 pb-3"
      >
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {messages.length === 0 && (
            <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--ink-3)]">
              {lang === "th"
                ? "ลอง log มื้อ หรือเล่าให้โค้ชฟังว่าวันนี้เป็นยังไง"
                : "Log a meal or tell the coach how your day's going"}
              <br />
              <span className="text-xs">
                {lang === "th"
                  ? "เช่น \"Squat 80kg 5x5\", \"กินผัดไทย\", \"พรุ่งนี้กินอะไรดี\""
                  : '"Squat 80kg 5x5", "had pad thai", "what should I eat tomorrow?"'}
              </span>
            </div>
          )}
          {messages.map((m) => (
            <ChatBubble key={m.id} message={m} lang={lang} />
          ))}
        </div>
      </div>

      {/* Composer */}
      <div
        className="sticky bottom-0 left-0 right-0 border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur px-3 py-2"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
      >
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          {/* Model selector — replaces the old mic/camera placeholders.
              Forces a specific Gemini/Kimi tier server-side; "Auto" defers
              to chooseModel(). The fallback chain in client.ts still kicks
              in if the chosen tier is unavailable. */}
          <div ref={modelMenuRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setModelMenuOpen((v) => !v)}
              aria-label={lang === "th" ? "เลือกโมเดล" : "Choose model"}
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
              title={
                lang === "th"
                  ? `โมเดล: ${MODEL_LABEL[model]}`
                  : `Model: ${MODEL_LABEL[model]}`
              }
              className={cn(
                "h-10 px-2.5 rounded-full inline-flex items-center gap-1 text-xs font-medium",
                "bg-[var(--surface-2)] text-[var(--ink-2)] hover:text-[var(--ink)]",
                "transition-colors active:scale-[0.97]",
              )}
            >
              <Sparkles className="size-3.5" />
              <span className="tabular-nums">{MODEL_LABEL[model]}</span>
              <ChevronDown className="size-3" />
            </button>
            {modelMenuOpen && (
              <div
                role="menu"
                className={cn(
                  "absolute bottom-12 left-0 z-50 min-w-[140px] rounded-[12px] border border-[var(--line)]",
                  "bg-[var(--surface)] shadow-lg p-1",
                )}
              >
                {MODEL_ORDER.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={model === m}
                    onClick={() => chooseModelChoice(m)}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-[8px] text-xs",
                      "hover:bg-[var(--surface-2)] transition-colors",
                      model === m
                        ? "bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                        : "text-[var(--ink-2)]",
                    )}
                  >
                    {MODEL_LABEL[m]}
                    {m === "kimi" && (
                      <span className="ml-1 text-[10px] text-[var(--ink-3)]">paid</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={t("ask_coach_short", lang)}
            rows={1}
            disabled={pending}
            className={cn(
              "flex-1 min-h-[40px] max-h-32 resize-none rounded-[14px] px-3 py-2.5 text-sm",
              "bg-[var(--surface-2)] text-[var(--ink)] placeholder:text-[var(--ink-3)]",
              "outline-none focus:ring-2 focus:ring-[var(--accent)]/30 disabled:opacity-60",
            )}
          />
          {pending ? (
            <button
              onClick={cancel}
              aria-label={t("close", lang)}
              className="size-10 rounded-full inline-flex items-center justify-center shrink-0 transition-transform active:scale-[0.97] bg-[var(--ink)] text-[var(--bg)]"
            >
              <Square className="size-3.5 fill-current" />
            </button>
          ) : (
            <button
              onClick={send}
              disabled={!input.trim()}
              aria-label="Send"
              className={cn(
                "size-10 rounded-full inline-flex items-center justify-center shrink-0 transition-transform active:scale-[0.97]",
                input.trim()
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-2)] text-[var(--ink-3)]",
              )}
            >
              <Send className="size-4" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function ChatBubble({
  message,
  lang,
}: {
  message: HiFiChatMessageData;
  lang: Lang;
}) {
  const isUser = message.role === "user";
  const events = message.toolEvents ?? [];
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-1.5 flex flex-col",
          isUser ? "items-end" : "items-start",
        )}
      >
        {!isUser && message.agent && <HiFiAgentBadge agent={message.agent} />}
        <div
          className={cn(
            "whitespace-pre-wrap rounded-[18px] px-3.5 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-[var(--accent)] text-white rounded-br-[6px]"
              : "bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] rounded-bl-[6px]",
          )}
        >
          {message.pending ? (
            <span className="inline-flex gap-1 items-center py-1">
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
              <span className="size-1.5 animate-bounce rounded-full bg-current" />
            </span>
          ) : (
            message.content
          )}
        </div>
        {events.length > 0 && (
          <div className="w-full space-y-1.5">
            {events.map((e, i) => (
              <HiFiToolCard key={i} event={e} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
