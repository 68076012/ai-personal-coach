"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Settings, LogOut, MessageSquare, BarChart3, CalendarDays, Home } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "วันนี้", icon: Home },
  { href: "/dashboard/chat", label: "คุย", icon: MessageSquare },
  { href: "/dashboard/plan", label: "แผน", icon: CalendarDays },
  { href: "/dashboard/progress", label: "ความก้าวหน้า", icon: BarChart3 },
];

export function TopBar({
  userName,
  userId,
  accent,
}: {
  userName: string;
  userId: string;
  accent: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const initial = userName.charAt(0).toUpperCase();

  const accentClass =
    accent === "coral"
      ? "bg-orange-500 text-white"
      : accent === "teal"
        ? "bg-teal-600 text-white"
        : accent === "violet"
          ? "bg-violet-600 text-white"
          : "bg-primary text-primary-foreground";

  function logout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/80 px-4 py-3 backdrop-blur">
      <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
        Coach
      </Link>
      <nav className="hidden items-center gap-1 sm:flex">
        {NAV.map((n) => (
          <Button
            key={n.href}
            asChild
            variant="ghost"
            size="sm"
            className="text-sm"
          >
            <Link href={n.href}>
              <n.icon className="size-4" /> {n.label}
            </Link>
          </Button>
        ))}
      </nav>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-full p-1 hover:bg-muted"
            aria-label="Account menu"
          >
            <Avatar className="size-8">
              <AvatarFallback className={accentClass}>{initial}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <div className="px-2 py-1.5 text-sm">
            <div className="font-medium">{userName}</div>
            <div className="text-xs text-muted-foreground">@{userId}</div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/dashboard/settings">
              <Settings className="size-4" /> ตั้งค่า
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={logout} disabled={pending}>
            <LogOut className="size-4" /> ออกจากระบบ
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
