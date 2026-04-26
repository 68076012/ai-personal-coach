import * as React from "react";
import { cn } from "@/lib/utils";

// Top sticky minimal app bar — date/eyebrow on top, big title underneath,
// optional right slot for an avatar/menu trigger. Sits above the main scroll
// area; bottom TabBar handles primary nav.
export function AppBar({
  eyebrow,
  title,
  right,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex items-center justify-between gap-3 px-4 pt-3 pb-2 bg-[var(--bg)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1 pr-3">
        {eyebrow && (
          <div className="text-xs font-medium text-[var(--ink-3)] truncate">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-[-0.02em] leading-tight truncate text-[var(--ink)]">
          {title}
        </h1>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
