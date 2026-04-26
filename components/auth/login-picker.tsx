"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const USERS = [
  {
    id: "garfield",
    label: "ฉันคือ Garfield",
    accent:
      "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30",
  },
  {
    id: "partner",
    label: "ฉันคือ Mai",
    accent:
      "bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/30",
  },
] as const;

export function LoginPicker() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const search = useSearchParams();

  function login(userId: (typeof USERS)[number]["id"]) {
    if (pending) return;
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const dest = search.get("from") ?? "/dashboard";
        router.replace(dest);
        router.refresh();
      } else {
        toast.error("เข้าใช้งานไม่สำเร็จ");
      }
    });
  }

  return (
    <Card>
      <CardContent className="grid gap-3 p-6">
        {USERS.map((u) => (
          <Button
            key={u.id}
            variant="outline"
            size="lg"
            className={`h-14 text-base ${u.accent}`}
            onClick={() => login(u.id)}
            disabled={pending}
          >
            {u.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
