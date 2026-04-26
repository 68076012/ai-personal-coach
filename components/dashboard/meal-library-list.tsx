"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarPlus,
  ChefHat,
  ChevronDown,
  Plus,
  Search,
  Soup,
  Timer,
} from "lucide-react";
import { HiFiCard, Chip, type ChipTone } from "@/components/hifi";
import { Input } from "@/components/ui/input";
import {
  addToTodayPlan,
  useSavedMeal,
} from "@/app/(app)/dashboard/library/actions";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { MealLibraryEntry, MealType } from "@/lib/db/schema";

const FILTERS = [
  { key: "all" as const, labelTh: "ทั้งหมด", labelEn: "All" },
  { key: "breakfast" as const, labelTh: "เช้า", labelEn: "B" },
  { key: "lunch" as const, labelTh: "กลางวัน", labelEn: "L" },
  { key: "dinner" as const, labelTh: "เย็น", labelEn: "D" },
  { key: "snack" as const, labelTh: "ของว่าง", labelEn: "S" },
];

const MEAL_TONE: Record<MealType, ChipTone> = {
  breakfast: "sun",
  lunch: "leaf",
  dinner: "coral",
  snack: "sky",
};
const MEAL_EMOJI: Record<MealType, string> = {
  breakfast: "🍳",
  lunch: "🥗",
  dinner: "🍛",
  snack: "🍎",
};

// QoL: when the page loads, default the filter to whichever meal slot
// matches the user's current ICT hour. Saves a tap when they're trying to
// figure out what to eat *right now*. "all" if outside any meal window.
function defaultFilterForNow(hourBkk: number): (typeof FILTERS)[number]["key"] {
  if (hourBkk >= 5 && hourBkk < 10) return "breakfast";
  if (hourBkk >= 11 && hourBkk < 14) return "lunch";
  if (hourBkk >= 17 && hourBkk < 21) return "dinner";
  if ((hourBkk >= 14 && hourBkk < 17) || (hourBkk >= 21 && hourBkk < 24))
    return "snack";
  return "all";
}

export function MealLibraryList({
  entries,
  lang,
  hourBkk,
}: {
  entries: MealLibraryEntry[];
  lang: Lang;
  hourBkk: number;
}) {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>(
    () => defaultFilterForNow(hourBkk),
  );
  const [query, setQuery] = React.useState("");
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [pendingAction, setPendingAction] = React.useState<"log" | "plan" | null>(
    null,
  );
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    let out = entries;
    if (filter !== "all") out = out.filter((e) => e.meal_type === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q) ||
          (e.recipe ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [entries, filter, query]);

  function onLog(name: string, mealType: MealType | null) {
    if (pending) return;
    setPendingId(name);
    setPendingAction("log");
    startTransition(async () => {
      try {
        const r = await useSavedMeal({
          name,
          meal_type: mealType ?? undefined,
        });
        toast.success(
          lang === "th"
            ? `บันทึกแล้ว — ${r.kcal} ${t("kcal_short", lang)}`
            : `Logged — ${r.kcal} ${t("kcal_short", lang)}`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "ใช้ไม่สำเร็จ");
      } finally {
        setPendingId(null);
        setPendingAction(null);
      }
    });
  }

  function onAddToPlan(name: string, mealType: MealType | null) {
    if (pending) return;
    setPendingId(name);
    setPendingAction("plan");
    startTransition(async () => {
      try {
        await addToTodayPlan({
          name,
          meal_type: mealType ?? undefined,
        });
        toast.success(
          lang === "th"
            ? "เพิ่มเข้าแผนวันนี้แล้ว"
            : "Added to today's plan",
        );
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "เพิ่มไม่สำเร็จ",
        );
      } finally {
        setPendingId(null);
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--ink-3)]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={lang === "th" ? "ค้นหาเมนู / วัตถุดิบ…" : "Search meals / ingredients…"}
          className="pl-9 bg-[var(--surface)] border-[var(--line)]"
        />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-[var(--accent)] text-white border-transparent"
                  : "bg-[var(--surface)] text-[var(--ink-2)] border-[var(--line)]",
              )}
            >
              {lang === "th" ? f.labelTh : f.labelEn}
            </button>
          );
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <HiFiCard className="p-8 text-center">
          <Soup className="size-8 text-[var(--ink-4)] mx-auto mb-3" />
          <div className="text-sm text-[var(--ink-2)] font-medium">
            {entries.length === 0
              ? lang === "th"
                ? "ยังไม่มีเมนูใน library"
                : "Library is empty"
              : lang === "th"
                ? "ไม่พบเมนูที่ตรงกัน"
                : "No matches"}
          </div>
          <p className="text-xs text-[var(--ink-3)] mt-1.5">
            {lang === "th"
              ? "กดปุ่ม “+ คิดเมนูใหม่” ด้านบนเพื่อให้โค้ชเสนอเมนูพร้อมวิธีทำให้คุณ"
              : 'Tap "+ Generate" above to have the coach suggest new meals with recipes'}
          </p>
        </HiFiCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const mealType = (m.meal_type ?? "snack") as MealType;
            const tone = MEAL_TONE[mealType];
            const emoji = MEAL_EMOJI[mealType];
            const isExpanded = expandedId === m.id;
            const isPending = pendingId === m.name;
            const ingredients = (m.ingredients as string[] | null) ?? [];
            const hasDetail = m.recipe || ingredients.length > 0 || m.notes;
            return (
              <HiFiCard key={m.id} className="overflow-hidden">
                <div className="p-3 flex items-center gap-3">
                  <div
                    className={cn(
                      "size-11 rounded-[12px] inline-flex items-center justify-center text-xl shrink-0",
                      tone === "sun" && "bg-[var(--sun-soft)]",
                      tone === "leaf" && "bg-[var(--leaf-soft)]",
                      tone === "coral" && "bg-[var(--coral-soft)]",
                      tone === "sky" && "bg-[var(--sky-soft)]",
                    )}
                  >
                    {emoji}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : m.id)
                    }
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold truncate text-[var(--ink)] flex-1">
                        {m.name}
                      </div>
                      {hasDetail && (
                        <ChevronDown
                          className={cn(
                            "size-4 text-[var(--ink-3)] shrink-0 transition-transform",
                            isExpanded && "rotate-180",
                          )}
                        />
                      )}
                    </div>
                    <div className="text-xs text-[var(--ink-3)] tabular flex items-baseline gap-2 flex-wrap mt-0.5">
                      <span>
                        {m.kcal} {t("kcal_short", lang)}
                      </span>
                      <span>
                        P{Math.round(m.protein_g)} · C{Math.round(m.carb_g)} · F{Math.round(m.fat_g)}
                      </span>
                      {m.prep_min !== null && m.prep_min !== undefined && (
                        <span className="inline-flex items-center gap-0.5">
                          <Timer className="size-3" />
                          {m.prep_min}m
                        </span>
                      )}
                      {m.times_used > 0 && (
                        <Chip tone="neutral" className="px-1.5 py-0.5 text-[10px]">
                          {m.times_used}×
                        </Chip>
                      )}
                    </div>
                  </button>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => onAddToPlan(m.name, mealType)}
                      disabled={isPending || pending}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 h-7 rounded-full",
                        "bg-[var(--surface-2)] text-[var(--ink-2)] text-[11px] font-semibold",
                        "active:scale-[0.97] transition-transform disabled:opacity-50",
                      )}
                      title={
                        lang === "th" ? "เพิ่มเข้าแผนวันนี้" : "Add to today's plan"
                      }
                    >
                      <CalendarPlus className="size-3" />
                      {isPending && pendingAction === "plan"
                        ? "…"
                        : lang === "th"
                          ? "แผน"
                          : "Plan"}
                    </button>
                    <button
                      onClick={() => onLog(m.name, mealType)}
                      disabled={isPending || pending}
                      className={cn(
                        "inline-flex items-center gap-1 px-2.5 h-7 rounded-full",
                        "bg-[var(--accent-soft)] text-[var(--accent)] text-[11px] font-semibold",
                        "active:scale-[0.97] transition-transform disabled:opacity-50",
                      )}
                      title={
                        lang === "th" ? "บันทึกว่ากินแล้ว" : "Log as eaten"
                      }
                    >
                      <Plus className="size-3" />
                      {isPending && pendingAction === "log"
                        ? "…"
                        : lang === "th"
                          ? "กิน"
                          : "Log"}
                    </button>
                  </div>
                </div>

                {/* Expanded detail panel — ingredients + recipe + notes */}
                {isExpanded && hasDetail && (
                  <div className="border-t border-[var(--line)] bg-[var(--surface-2)]/50 px-3 py-3 space-y-3 text-sm">
                    {ingredients.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-1.5 inline-flex items-center gap-1">
                          <Soup className="size-3" />
                          {lang === "th" ? "วัตถุดิบ" : "Ingredients"}
                        </div>
                        <ul className="text-[13px] text-[var(--ink-2)] space-y-0.5 ml-1">
                          {ingredients.map((ing, i) => (
                            <li key={i} className="flex gap-1.5">
                              <span className="text-[var(--ink-4)]">·</span>
                              <span>{ing}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.recipe && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-1.5 inline-flex items-center gap-1">
                          <ChefHat className="size-3" />
                          {lang === "th" ? "วิธีทำ" : "Recipe"}
                        </div>
                        <div className="text-[13px] text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
                          {m.recipe}
                        </div>
                      </div>
                    )}
                    {m.notes && (
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-1.5">
                          {lang === "th" ? "หมายเหตุ" : "Notes"}
                        </div>
                        <div className="text-[13px] text-[var(--ink-3)] italic">
                          {m.notes}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </HiFiCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
