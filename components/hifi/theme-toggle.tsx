"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Lang } from "@/lib/i18n";

interface Option {
  value: "light" | "dark" | "system";
  icon: React.ComponentType<{ className?: string }>;
  labelTh: string;
  labelEn: string;
}

const OPTIONS: readonly Option[] = [
  { value: "light", icon: Sun, labelTh: "สว่าง", labelEn: "Light" },
  { value: "dark", icon: Moon, labelTh: "มืด", labelEn: "Dark" },
  { value: "system", icon: Monitor, labelTh: "ระบบ", labelEn: "Auto" },
];

export function ThemeToggle({ lang }: { lang: Lang }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const active = mounted ? theme ?? "system" : "system";

  return (
    <div
      className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
      role="radiogroup"
      aria-label="Theme"
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const isActive = opt.value === active;
        return (
          <button
            key={opt.value}
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(opt.value)}
            className={cn(
              "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors",
              isActive
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-1)]"
                : "text-[var(--ink-3)]",
            )}
            title={lang === "th" ? opt.labelTh : opt.labelEn}
          >
            <Icon className="size-3.5" />
            <span className="hidden sm:inline">
              {lang === "th" ? opt.labelTh : opt.labelEn}
            </span>
          </button>
        );
      })}
    </div>
  );
}
