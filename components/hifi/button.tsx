"use client";

import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

export type HiFiButtonVariant = "default" | "primary" | "soft" | "ghost";
export type HiFiButtonSize = "sm" | "md" | "lg" | "tile";

const VARIANT: Record<HiFiButtonVariant, string> = {
  default:
    "bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] hover:bg-[var(--surface-2)]",
  primary:
    "bg-[var(--accent)] text-white border-transparent shadow-[var(--sh-2)] hover:opacity-95",
  soft: "bg-[var(--accent-soft)] text-[var(--accent)] border-transparent",
  ghost: "bg-transparent border-transparent text-[var(--ink)]",
};

const SIZE: Record<HiFiButtonSize, string> = {
  sm: "h-9 px-3 text-sm rounded-[12px]",
  md: "h-11 px-4 text-[15px] rounded-[12px]",
  lg: "h-13 px-5 text-base rounded-[14px]",
  // Tile = quick-action grid button (Log meal / Log workout / Log weight on dashboard).
  tile: "h-16 flex-col gap-1 text-[11px] rounded-[12px] px-2",
};

// Hifi-styled button. Uses Radix Slot when asChild so Next <Link> children
// inherit styles without nesting an extra <button>.
export function HiFiButton({
  variant = "default",
  size = "md",
  asChild = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: HiFiButtonVariant;
  size?: HiFiButtonSize;
  asChild?: boolean;
}) {
  const Comp: React.ElementType = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="hifi-button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium leading-none transition-[transform,background] active:scale-[0.98]",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...props}
    />
  );
}
