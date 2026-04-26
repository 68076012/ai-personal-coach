"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Home,
  MessageCircle,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TabSpec {
  key: "home" | "plan" | "chat" | "progress" | "settings";
  href: string;
  icon: LucideIcon;
}

const TABS: readonly TabSpec[] = [
  { key: "home", href: "/dashboard", icon: Home },
  { key: "plan", href: "/dashboard/plan", icon: CalendarDays },
  { key: "chat", href: "/dashboard/chat", icon: MessageCircle },
  { key: "progress", href: "/dashboard/progress", icon: BarChart3 },
  { key: "settings", href: "/dashboard/settings", icon: Settings },
];

export type TabLabels = Record<TabSpec["key"], string>;

// Bottom 5-tab nav. Sticky, safe-area-padded for iOS notch. Active tab
// gets the per-user --accent color; icon stroke gets thicker too. Labels
// are passed in by the parent shell so they can be localized at request
// time without making this component async.
export function TabBar({ labels }: { labels: TabLabels }) {
  const pathname = usePathname();
  return (
    <nav
      data-slot="hifi-tabbar"
      className="sticky bottom-0 left-0 right-0 z-20 flex items-stretch bg-[var(--surface)] border-t border-[var(--line)] px-2 pt-1.5"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      {TABS.map(({ key, href, icon: Icon }) => {
        const active =
          key === "home"
            ? pathname === "/dashboard"
            : !!pathname?.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium leading-none transition-colors",
              active ? "text-[var(--accent)]" : "text-[var(--ink-3)]",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
            <span>{labels[key]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
