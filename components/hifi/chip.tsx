import * as React from "react";
import { cn } from "@/lib/utils";

export type ChipTone = "neutral" | "accent" | "leaf" | "sun" | "sky" | "coral" | "teal";

const TONE: Record<ChipTone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--ink-2)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  leaf: "bg-[var(--leaf-soft)] text-[var(--leaf)]",
  sun: "bg-[var(--sun-soft)] text-[#8a6712]",
  sky: "bg-[var(--sky-soft)] text-[var(--sky)]",
  coral: "bg-[var(--coral-soft)] text-[var(--coral)]",
  teal: "bg-[var(--teal-soft)] text-[var(--teal)]",
};

export function Chip({
  tone = "neutral",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: ChipTone }) {
  return (
    <span
      data-slot="hifi-chip"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium leading-none",
        TONE[tone],
        className,
      )}
      {...props}
    />
  );
}
