"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const USERS = [
  { id: "garfield", label: "ฉันคือ Garfield", accent: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/30" },
  { id: "partner", label: "ฉันคือ Partner", accent: "bg-teal-500/10 hover:bg-teal-500/20 border-teal-500/30" },
] as const;

export function LoginPicker() {
  const [selected, setSelected] = useState<(typeof USERS)[number]["id"] | null>(
    null,
  );
  const [passcode, setPasscode] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const search = useSearchParams();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !passcode) return;
    startTransition(async () => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: selected, passcode }),
      });
      if (res.ok) {
        const dest = search.get("from") ?? "/dashboard";
        router.replace(dest);
        router.refresh();
      } else {
        toast.error("Passcode ไม่ถูกต้อง");
      }
    });
  }

  if (!selected) {
    return (
      <Card>
        <CardContent className="grid gap-3 p-6">
          {USERS.map((u) => (
            <Button
              key={u.id}
              variant="outline"
              size="lg"
              className={`h-14 text-base ${u.accent}`}
              onClick={() => setSelected(u.id)}
            >
              {u.label}
            </Button>
          ))}
        </CardContent>
      </Card>
    );
  }

  const userLabel = USERS.find((u) => u.id === selected)?.label ?? "";

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="text-sm">
            <span className="text-muted-foreground">เข้าใช้งานในชื่อ </span>
            <span className="font-medium">{userLabel}</span>
          </div>
          <Input
            type="password"
            inputMode="text"
            placeholder="Passcode"
            autoFocus
            autoComplete="off"
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            disabled={pending}
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSelected(null);
                setPasscode("");
              }}
              disabled={pending}
            >
              ย้อนกลับ
            </Button>
            <Button type="submit" className="flex-1" disabled={pending || !passcode}>
              {pending ? "กำลังเข้า…" : "เข้าใช้งาน"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
