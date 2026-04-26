"use client";

import * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Mic, Send } from "lucide-react";
import { toast } from "sonner";
import { HiFiAgentBadge, type AgentKey } from "./hifi-agent-badge";
import { HiFiToolCard, type ToolEvent } from "./hifi-tool-card";
import { type Lang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

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
  const scrollerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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
    const userMsg: HiFiChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const placeholder: HiFiChatMessageData = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((m) => [...m, userMsg, placeholder]);
    setInput("");

    startTransition(async () => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, agent: defaultAgent }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.message ?? json.error ?? "request failed");
        }
        setMessages((m) =>
          m.map((msg) =>
            msg.id === placeholder.id
              ? {
                  ...msg,
                  pending: false,
                  content: json.reply,
                  agent: json.agent as AgentKey,
                  toolEvents: json.toolEvents,
                }
              : msg,
          ),
        );
        router.refresh();
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        toast.error(errMsg);
        setMessages((m) => m.filter((x) => x.id !== placeholder.id));
      }
    });
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
          {/* Voice + camera placeholders — Phase 2 in original spec, render
              disabled tap-targets so the composer feels complete */}
          <button
            disabled
            aria-label={lang === "th" ? "เสียง (เร็วๆ นี้)" : "Voice (soon)"}
            className="size-10 rounded-full bg-[var(--surface-2)] text-[var(--ink-3)] inline-flex items-center justify-center opacity-50 cursor-not-allowed shrink-0"
          >
            <Mic className="size-4" />
          </button>
          <button
            disabled
            aria-label={lang === "th" ? "ถ่ายอาหาร (เร็วๆ นี้)" : "Camera (soon)"}
            className="size-10 rounded-full bg-[var(--surface-2)] text-[var(--ink-3)] inline-flex items-center justify-center opacity-50 cursor-not-allowed shrink-0"
          >
            <Camera className="size-4" />
          </button>
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
          <button
            onClick={send}
            disabled={pending || !input.trim()}
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
