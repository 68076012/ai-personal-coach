"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserOption {
  id: "garfield" | "partner";
  name: string;
  accent: "coral" | "teal";
  initial: string;
}

const USERS: readonly UserOption[] = [
  { id: "garfield", name: "Garfield", accent: "coral", initial: "G" },
  { id: "partner", name: "Mai", accent: "teal", initial: "ม" },
] as const;

export function HiFiLoginCards() {
  const router = useRouter();
  const search = useSearchParams();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  async function pick(u: UserOption) {
    if (pendingId) return;
    setPendingId(u.id);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: u.id }),
      });
      if (!res.ok) throw new Error("login_failed");
      const dest = search.get("from") ?? "/dashboard";
      router.replace(dest);
      router.refresh();
    } catch {
      setPendingId(null);
      toast.error("เข้าใช้งานไม่สำเร็จ");
    }
  }

  return (
    <div className="space-y-3">
      {USERS.map((u) => (
        <button
          key={u.id}
          data-accent={u.accent}
          onClick={() => pick(u)}
          disabled={pendingId !== null}
          className={cn(
            "w-full flex items-center gap-4 p-5 rounded-[var(--r-lg)]",
            "bg-[var(--accent-soft)] border border-[var(--accent)]/30",
            "transition-all active:scale-[0.99] disabled:opacity-60",
            pendingId === u.id && "opacity-80",
          )}
        >
          <div className="size-14 rounded-full bg-[var(--accent)] text-white inline-flex items-center justify-center text-xl font-semibold shrink-0">
            {u.initial}
          </div>
          <div className="flex-1 text-left min-w-0">
            <div className="text-base font-semibold text-[var(--ink)]">
              {u.name}
            </div>
            <div className="text-xs text-[var(--ink-3)] mt-0.5">
              {pendingId === u.id ? "กำลังเข้าระบบ…" : "แตะเพื่อเริ่ม"}
            </div>
          </div>
          <ChevronRight className="size-5 text-[var(--accent)] shrink-0" />
        </button>
      ))}
    </div>
  );
}
