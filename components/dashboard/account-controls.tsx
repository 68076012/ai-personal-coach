"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LogOut, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { HiFiCard, HiFiButton } from "@/components/hifi";
import { type Lang } from "@/lib/i18n";

export function AccountControls({
  userName,
  lang,
}: {
  userName: string;
  lang: Lang;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function logoutAndGoTo(dest: "/login") {
    startTransition(async () => {
      try {
        const res = await fetch("/api/auth/logout", { method: "POST" });
        if (!res.ok) throw new Error("logout_failed");
        // Use replace + refresh so the back button doesn't bring us back
        // to a logged-in page that'll fail middleware checks.
        router.replace(dest);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Sign out failed");
      }
    });
  }

  return (
    <HiFiCard className="p-4 space-y-3">
      <div>
        <div className="text-sm font-semibold text-[var(--ink)]">
          {lang === "th" ? "บัญชี" : "Account"}
        </div>
        <div className="text-xs text-[var(--ink-3)] mt-0.5">
          {lang === "th"
            ? `ลงชื่อเข้าใช้เป็น ${userName}`
            : `Signed in as ${userName}`}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <HiFiButton
          size="sm"
          onClick={() => logoutAndGoTo("/login")}
          disabled={pending}
        >
          <UserCheck className="size-4" />
          {lang === "th" ? "สลับบัญชี" : "Switch account"}
        </HiFiButton>
        <HiFiButton
          variant="ghost"
          size="sm"
          onClick={() => logoutAndGoTo("/login")}
          disabled={pending}
        >
          <LogOut className="size-4" />
          {lang === "th" ? "ออกจากระบบ" : "Sign out"}
        </HiFiButton>
      </div>
    </HiFiCard>
  );
}
