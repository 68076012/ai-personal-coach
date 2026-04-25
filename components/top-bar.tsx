"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Settings,
  LogOut,
  MessageSquare,
  BarChart3,
  CalendarDays,
  Home,
  Menu,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [navOpen, setNavOpen] = useState(false);
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
      <div className="flex items-center gap-2">
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b">
              <SheetTitle>เมนู</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 p-2">
              {NAV.map((n) => {
                const active =
                  n.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname?.startsWith(n.href);
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setNavOpen(false)}
                    className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                      active
                        ? "bg-muted font-medium"
                        : "hover:bg-muted/60"
                    }`}
                  >
                    <n.icon className="size-4" />
                    {n.label}
                  </Link>
                );
              })}
              <div className="my-1 border-t" />
              <Link
                href="/dashboard/settings"
                onClick={() => setNavOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm hover:bg-muted/60"
              >
                <Settings className="size-4" />
                ตั้งค่า
              </Link>
              <button
                onClick={() => {
                  setNavOpen(false);
                  logout();
                }}
                disabled={pending}
                className="flex items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted/60 disabled:opacity-50"
              >
                <LogOut className="size-4" />
                ออกจากระบบ
              </button>
            </nav>
          </SheetContent>
        </Sheet>
        <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
          Coach
        </Link>
      </div>
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
