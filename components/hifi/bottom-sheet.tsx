"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Hifi-styled bottom sheet — wraps the shadcn Sheet with the warm-paper
// visual language. Use for LogMeal, PauseWorkout, etc. Props mirror Sheet's
// open/onOpenChange so callers control state directly.
export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          "bg-[var(--surface)] border-t border-[var(--line)] rounded-t-[var(--r-xl)] p-0 max-h-[88vh] flex flex-col",
          className,
        )}
      >
        {(title || description) && (
          <SheetHeader className="px-5 pt-5 pb-3 text-left">
            {title && (
              <SheetTitle className="text-lg font-semibold text-[var(--ink)]">
                {title}
              </SheetTitle>
            )}
            {description && (
              <SheetDescription className="text-sm text-[var(--ink-3)]">
                {description}
              </SheetDescription>
            )}
          </SheetHeader>
        )}
        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <SheetFooter
            className="border-t border-[var(--line)] px-5 py-3 sm:flex-row sm:justify-end sm:gap-2"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 12px)" }}
          >
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
