"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChefHat, Dumbbell, RefreshCcw, Apple } from "lucide-react";

const ACTIONS = [
  { label: "วันนี้กินอะไรดี", message: "วันนี้กินอะไรดี?", icon: ChefHat },
  { label: "บันทึกมื้อเช้า", message: "ขอ log มื้อเช้า: ", icon: Apple, draft: true },
  { label: "บันทึกออกกำลัง", message: "ขอ log workout วันนี้: ", icon: Dumbbell, draft: true },
  { label: "เปลี่ยนแผนวันนี้", message: "ขอเปลี่ยนแผนวันนี้: ", icon: RefreshCcw, draft: true },
];

export function QuickActions() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function send(message: string, draft?: boolean) {
    if (draft) {
      // Take user to chat with prefilled draft via search param
      const url = `/dashboard/chat?draft=${encodeURIComponent(message)}`;
      router.push(url);
      return;
    }
    startTransition(async () => {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, agent: "auto" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.message ?? "ส่งไม่สำเร็จ");
        return;
      }
      toast.success("โค้ชตอบแล้ว — ดูในหน้าแชท");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      {ACTIONS.map((a) => (
        <Button
          key={a.label}
          variant="outline"
          size="sm"
          className="h-auto justify-start py-2 text-left"
          onClick={() => send(a.message, a.draft)}
          disabled={pending}
        >
          <a.icon className="size-4" />
          <span className="text-xs">{a.label}</span>
        </Button>
      ))}
    </div>
  );
}
