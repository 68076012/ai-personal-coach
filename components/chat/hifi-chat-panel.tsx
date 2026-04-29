"use client";

import * as React from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Square } from "lucide-react";
import { toast } from "sonner";
import { HiFiAgentBadge, type AgentKey } from "./hifi-agent-badge";
import { HiFiToolCard, type ToolEvent } from "./hifi-tool-card";
import { type Lang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// Optimistic in-flight tracking. When the user sends a message, we stash it
// here BEFORE the fetch starts so the bubble survives page refresh / tab
// close / mid-flight reload. The server-side conversations write happens a
// few hundred ms later inside runPlanSynthesis, so a fast refresh would
// otherwise see no record yet and lose the user's question.
const IN_FLIGHT_KEY = "chat:in-flight";
const IN_FLIGHT_TTL_MS = 5 * 60 * 1000;

interface InFlightEntry {
  message: string;
  ts: number;
  id: string;
}

function readInFlight(): InFlightEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(IN_FLIGHT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<InFlightEntry>;
    if (
      typeof parsed.message !== "string" ||
      typeof parsed.ts !== "number" ||
      typeof parsed.id !== "string"
    ) {
      return null;
    }
    if (Date.now() - parsed.ts > IN_FLIGHT_TTL_MS) {
      window.localStorage.removeItem(IN_FLIGHT_KEY);
      return null;
    }
    return parsed as InFlightEntry;
  } catch {
    return null;
  }
}

function writeInFlight(message: string): InFlightEntry {
  const entry: InFlightEntry = {
    message,
    ts: Date.now(),
    id: crypto.randomUUID(),
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(IN_FLIGHT_KEY, JSON.stringify(entry));
    } catch {
      // Quota exceeded etc. — tolerate silently; optimistic UX is best-effort.
    }
  }
  return entry;
}

function clearInFlight() {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(IN_FLIGHT_KEY);
    } catch {
      // ignore
    }
  }
}

// Bare-bones SSE event-stream parser. Reads the response body, splits on
// blank-line boundaries, and dispatches to onEvent for each parsed event.
// Server emits frames as `event: <name>\ndata: <json>\n\n`. We tolerate
// comment frames (lines starting with ":") and ignore unrecognized fields.
async function readSseStream(
  res: Response,
  onEvent: (event: string, data: unknown) => void,
  signal: AbortSignal,
): Promise<void> {
  if (!res.body) throw new Error("no response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // Make sure we drop the reader if the caller aborts mid-stream.
  signal.addEventListener("abort", () => {
    reader.cancel().catch(() => {});
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    // SSE separator is two consecutive newlines. Handle both \n\n and \r\n\r\n.
    while (true) {
      const idxN = buffer.indexOf("\n\n");
      const idxR = buffer.indexOf("\r\n\r\n");
      if (idxN === -1 && idxR === -1) break;
      sep =
        idxN === -1
          ? idxR
          : idxR === -1
            ? idxN
            : Math.min(idxN, idxR);
      const sepLen = sep === idxR ? 4 : 2;
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + sepLen);
      let eventName = "message";
      const dataLines: string[] = [];
      for (const rawLine of block.split(/\r?\n/)) {
        if (!rawLine || rawLine.startsWith(":")) continue;
        if (rawLine.startsWith("event:")) {
          eventName = rawLine.slice(6).trim();
        } else if (rawLine.startsWith("data:")) {
          dataLines.push(rawLine.slice(5).trim());
        }
      }
      let payload: unknown = null;
      if (dataLines.length > 0) {
        const joined = dataLines.join("\n");
        try {
          payload = JSON.parse(joined);
        } catch {
          payload = joined;
        }
      }
      onEvent(eventName, payload);
    }
  }
}

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
  const abortRef = useRef<AbortController | null>(null);
  const router = useRouter();

  // Restore optimistic in-flight state on mount. If the user sent a message
  // and refreshed/closed the tab before the response arrived, surface their
  // bubble + a pending placeholder so the chat doesn't look like it
  // forgot. Server-side persistence is the authoritative source — we
  // reconcile against initialMessages so we don't double-render.
  useEffect(() => {
    const inFlight = readInFlight();
    if (!inFlight) return;
    // Did initialMessages already include this user message? Walk from the
    // end (most recent) and look for content match.
    const matchIndex = (() => {
      for (let i = initialMessages.length - 1; i >= 0; i--) {
        const m = initialMessages[i];
        if (m.role === "user" && m.content === inFlight.message) return i;
      }
      return -1;
    })();
    if (matchIndex !== -1) {
      // User message is on the server. Is there an assistant reply after it?
      const hasAssistantAfter = initialMessages
        .slice(matchIndex + 1)
        .some((m) => m.role === "assistant" && !m.pending);
      if (hasAssistantAfter) {
        // Round-trip is done; clear the optimistic marker.
        clearInFlight();
        return;
      }
      // Server has the user msg but no reply yet. The server-side render
      // already appends a pending placeholder when this state is fresh —
      // do nothing here, avoid double bubble.
      return;
    }
    // User msg isn't in the server data yet (refreshed before logTurn
    // committed). Append optimistic user bubble + pending placeholder.
    setMessages((m) => [
      ...m,
      {
        id: `optim-user-${inFlight.id}`,
        role: "user",
        content: inFlight.message,
      },
      {
        id: `optim-pending-${inFlight.id}`,
        role: "assistant",
        content: "",
        pending: true,
        agent: "orchestrator",
      },
    ]);
    // Best-effort: poll for the reply landing in conversations every 4s
    // by re-fetching server state. Stops once the user message in the
    // initial payload (after refresh) flips the matchIndex branch above.
    const interval = window.setInterval(() => {
      const stillInFlight = readInFlight();
      if (!stillInFlight || stillInFlight.id !== inFlight.id) {
        window.clearInterval(interval);
        return;
      }
      router.refresh();
    }, 4000);
    return () => window.clearInterval(interval);
    // initialMessages is intentionally captured at mount — a fresh page
    // load creates a new HiFiChatPanel mount with fresh initialMessages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    // Persist optimistic state so a mid-flight refresh / tab close still
    // surfaces the bubble + spinner on remount.
    writeInFlight(text);

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    startTransition(async () => {
      // Watchdog — if no SSE event lands for ~30s, assume the request silently
      // died and abort. The server emits heartbeats every 5s while alive, so
      // a 30s gap means something's definitely wrong.
      let lastEventAt = Date.now();
      const watchdogId = window.setInterval(() => {
        if (Date.now() - lastEventAt > 30_000) {
          window.clearInterval(watchdogId);
          ctrl.abort(new DOMException("watchdog: no events for 30s", "WatchdogError"));
        }
      }, 5_000);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: text, agent: defaultAgent }),
          signal: ctrl.signal,
        });
        if (!res.ok) {
          // Pre-stream rejection — auth, validation, etc. Body is plain JSON.
          const json = await res.json().catch(() => ({}));
          throw new Error(
            json.message ?? json.error ?? `request failed (${res.status})`,
          );
        }

        type ResultPayload = {
          replies?: Array<{
            agent: AgentKey;
            reply: string;
            toolEvents: ToolEvent[];
          }>;
        };
        type ErrorPayload = { kind?: string; message?: string };
        const ref: {
          resolved: boolean;
          result: ResultPayload | null;
          error: ErrorPayload | null;
        } = { resolved: false, result: null, error: null };

        // True once the first `token` lands. From that point we stop
        // overwriting `content` with phase labels and start appending
        // streamed prose instead.
        let streaming = false;

        await readSseStream(
          res,
          (event, data) => {
            lastEventAt = Date.now();
            if (event === "phase") {
              if (streaming) return; // don't overwrite live text with stale phase labels
              const message =
                (data as { message?: string } | null)?.message ?? "";
              setMessages((m) =>
                m.map((msg) =>
                  msg.id === placeholderId
                    ? { ...msg, content: message, pending: true }
                    : msg,
                ),
              );
            } else if (event === "token") {
              const text = (data as { text?: string } | null)?.text ?? "";
              if (!text) return;
              if (!streaming) {
                streaming = true;
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === placeholderId
                      ? {
                          ...msg,
                          content: text,
                          pending: false,
                          agent: "orchestrator",
                        }
                      : msg,
                  ),
                );
              } else {
                setMessages((m) =>
                  m.map((msg) =>
                    msg.id === placeholderId
                      ? { ...msg, content: msg.content + text }
                      : msg,
                  ),
                );
              }
            } else if (event === "result") {
              ref.result = data as ResultPayload;
              ref.resolved = true;
            } else if (event === "error") {
              ref.error = data as ErrorPayload;
              ref.resolved = true;
            }
            // heartbeat events just refresh lastEventAt above.
          },
          ctrl.signal,
        );

        window.clearInterval(watchdogId);

        if (ref.error) {
          throw new Error(
            ref.error.message ?? ref.error.kind ?? "request failed",
          );
        }
        if (!ref.resolved || !ref.result) {
          throw new Error("empty response");
        }
        const replies = ref.result.replies ?? [];
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
        // Round-trip succeeded — release the optimistic marker.
        clearInFlight();
      } catch (err) {
        const aborted = (err as { name?: string }).name === "AbortError";
        const watchdog = (err as { name?: string }).name === "WatchdogError";
        if (watchdog) {
          toast.error(
            "ไม่ได้ยินจาก server เกิน 30 วิ — น่าจะค้าง ลองส่งใหม่",
          );
        } else if (!aborted) {
          const errMsg = err instanceof Error ? err.message : String(err);
          toast.error(errMsg);
        }
        // On error or explicit abort, drop the optimistic state. The server
        // may have already persisted the user message via runPlanSynthesis;
        // if so, it'll show on next refresh without the optimistic bubble.
        clearInFlight();
        setMessages((m) => m.filter((x) => x.id !== placeholderId));
      } finally {
        window.clearInterval(watchdogId);
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
