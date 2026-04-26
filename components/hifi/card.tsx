import * as React from "react";
import { cn } from "@/lib/utils";

// Warm-paper card. Borders + tone, no drop-shadow per spec ("avoid shadows;
// rely on borders + tone"). The very subtle --sh-1 is for non-grouped cards
// only — pass shadow={false} to drop it.
export function HiFiCard({
  className,
  shadow = true,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { shadow?: boolean }) {
  return (
    <div
      data-slot="hifi-card"
      className={cn(
        "bg-[var(--surface)] border border-[var(--line)] rounded-[var(--r-lg)]",
        shadow && "shadow-[var(--sh-1)]",
        className,
      )}
      {...props}
    />
  );
}
