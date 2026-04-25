"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ChatMessage, type ChatMessageData } from "./chat-message";
import type { AgentKey } from "./agent-badge";

interface Props {
  initialMessages?: ChatMessageData[];
  defaultAgent?: AgentKey | "auto";
  initialDraft?: string;
}

export function ChatPanel({ initialMessages = [], defaultAgent = "auto", initialDraft = "" }: Props) {
  const [messages, setMessages] = useState<ChatMessageData[]>(initialMessages);
  const [input, setInput] = useState(initialDraft);
  const [pending, startTransition] = useTransition();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function send() {
    const text = input.trim();
    if (!text || pending) return;

    const userMsg: ChatMessageData = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };
    const placeholder: ChatMessageData = {
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
        // Refresh server components (today plan, recent logs, etc.)
        router.refresh();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error(msg);
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
    <div className="flex flex-1 flex-col">
      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
          {messages.length === 0 && (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              ลอง log มื้อ หรือเล่าให้โค้ชฟังว่าวันนี้เป็นยังไง
              <br />
              เช่น “Squat 80kg 5x5”, “กินผัดไทย 1 จาน”, “วันนี้กินอะไรดี”
            </div>
          )}
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} />
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="พิมพ์เพื่อ log หรือคุยกับโค้ช…"
            rows={1}
            className="min-h-[44px] max-h-32 resize-none"
            disabled={pending}
          />
          <Button onClick={send} disabled={pending || !input.trim()} size="icon" aria-label="ส่ง">
            <Send className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
