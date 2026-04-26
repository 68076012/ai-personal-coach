"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const RANGES = [7, 30, 90] as const;
export type RangeDays = (typeof RANGES)[number];

export function RangePicker({ current }: { current: RangeDays }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function pick(days: RangeDays) {
    if (days === current) return;
    const params = new URLSearchParams(search.toString());
    params.set("range", String(days));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div
      className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
      role="radiogroup"
      aria-label="Range"
    >
      {RANGES.map((d) => {
        const active = d === current;
        return (
          <button
            key={d}
            role="radio"
            aria-checked={active}
            onClick={() => pick(d)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors tabular",
              active
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-1)]"
                : "text-[var(--ink-3)]",
            )}
          >
            {d}d
          </button>
        );
      })}
    </div>
  );
}
