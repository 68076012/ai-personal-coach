import * as React from "react";
import { cn } from "@/lib/utils";

// Display number for hero stat cards. Tabular nums + tight tracking match the
// design spec (-0.04em). Sizes: hero=56, lg=44, md=32. Pass through className
// to override font size.
export function BigNum({
  value,
  unit,
  size = "hero",
  className,
}: {
  value: React.ReactNode;
  unit?: React.ReactNode;
  size?: "hero" | "lg" | "md";
  className?: string;
}) {
  const sizeClass =
    size === "hero"
      ? "text-[56px] leading-none"
      : size === "lg"
        ? "text-[44px] leading-none"
        : "text-[32px] leading-none";
  return (
    <span
      className={cn(
        "tabular font-bold tracking-[-0.04em] text-[var(--ink)] whitespace-nowrap",
        sizeClass,
        className,
      )}
    >
      {value}
      {unit && (
        <span className="ml-0.5 text-sm font-medium text-[var(--ink-3)]">
          {unit}
        </span>
      )}
    </span>
  );
}
