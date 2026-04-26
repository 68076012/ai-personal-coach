"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { setLangAction } from "@/app/(app)/dashboard/settings/actions";
import { LANGS, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const LABELS: Record<Lang, string> = {
  th: "ไทย",
  en: "English",
};

export function LangToggle({ current }: { current: Lang }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [optimistic, setOptimistic] = React.useState(current);

  function pick(lang: Lang) {
    if (lang === optimistic || pending) return;
    setOptimistic(lang);
    startTransition(async () => {
      await setLangAction({ lang });
      router.refresh();
    });
  }

  return (
    <div
      className="inline-flex rounded-full border border-[var(--line)] bg-[var(--surface-2)] p-0.5"
      role="radiogroup"
      aria-label="Language"
    >
      {LANGS.map((l) => {
        const active = l === optimistic;
        return (
          <button
            key={l}
            role="radio"
            aria-checked={active}
            onClick={() => pick(l)}
            disabled={pending}
            className={cn(
              "px-3.5 py-1 rounded-full text-xs font-medium transition-colors",
              active
                ? "bg-[var(--surface)] text-[var(--ink)] shadow-[var(--sh-1)]"
                : "text-[var(--ink-3)]",
            )}
          >
            {LABELS[l]}
          </button>
        );
      })}
    </div>
  );
}
