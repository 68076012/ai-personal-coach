import * as React from "react";
import { cn } from "@/lib/utils";

export type BarColor = "accent" | "leaf" | "sun" | "sky" | "coral" | "teal";

const FILL: Record<BarColor, string> = {
  accent: "bg-[var(--accent)]",
  leaf: "bg-[var(--leaf)]",
  sun: "bg-[var(--sun)]",
  sky: "bg-[var(--sky)]",
  coral: "bg-[var(--coral)]",
  teal: "bg-[var(--teal)]",
};

// Linear progress bar. Animates the fill on value change so screens that
// re-render with new totals (macros, kcal) feel alive without extra wiring.
export function Bar({
  value,
  max = 100,
  color = "accent",
  className,
}: {
  value: number;
  max?: number;
  color?: BarColor;
  className?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={cn(
        "h-1.5 w-full bg-[var(--surface-2)] rounded-full overflow-hidden",
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-[cubic-bezier(.2,.8,.2,1)]",
          FILL[color],
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
