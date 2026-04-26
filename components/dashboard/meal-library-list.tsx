"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Plus, Search, Soup } from "lucide-react";
import { HiFiCard, Chip, type ChipTone } from "@/components/hifi";
import { Input } from "@/components/ui/input";
import { useSavedMeal } from "@/app/(app)/dashboard/library/actions";
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

export function MealLibraryList({
  entries,
  lang,
}: {
  entries: MealLibraryEntry[];
  lang: Lang;
}) {
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("all");
  const [query, setQuery] = React.useState("");
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    let out = entries;
    if (filter !== "all") out = out.filter((e) => e.meal_type === filter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.notes ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [entries, filter, query]);

  function onUse(name: string, mealType: MealType | null) {
    if (pending) return;
    setPendingId(name);
    startTransition(async () => {
      try {
        const r = await useSavedMeal({
          name,
          meal_type: mealType ?? undefined,
        });
        toast.success(`เพิ่มเข้า log วันนี้ — ${r.kcal} ${t("kcal_short", lang)}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "ใช้ไม่สำเร็จ");
      } finally {
        setPendingId(null);
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
          placeholder={lang === "th" ? "ค้นหาเมนู…" : "Search meals…"}
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
              ? "ลองบอกโค้ชในแชท: \"บันทึกเมนูข้าวไก่ย่างเก็บไว้\" — โค้ชจะใช้ save_meal ให้"
              : 'Tell the coach: "save the chicken-rice as a favorite" — they\'ll call save_meal'}
          </p>
        </HiFiCard>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const mealType = (m.meal_type ?? "snack") as MealType;
            const tone = MEAL_TONE[mealType];
            const emoji = MEAL_EMOJI[mealType];
            const isPending = pendingId === m.name;
            return (
              <HiFiCard key={m.id} className="p-3 flex items-center gap-3">
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
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate text-[var(--ink)]">
                    {m.name}
                  </div>
                  <div className="text-xs text-[var(--ink-3)] tabular flex items-baseline gap-2 flex-wrap mt-0.5">
                    <span>
                      {m.kcal} {t("kcal_short", lang)}
                    </span>
                    <span>
                      P{Math.round(m.protein_g)} · C{Math.round(m.carb_g)} · F{Math.round(m.fat_g)}
                    </span>
                    {m.times_used > 0 && (
                      <Chip tone="neutral" className="px-1.5 py-0.5 text-[10px]">
                        {m.times_used}×
                      </Chip>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => onUse(m.name, mealType)}
                  disabled={isPending || pending}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full",
                    "bg-[var(--accent-soft)] text-[var(--accent)] text-xs font-semibold",
                    "active:scale-[0.97] transition-transform disabled:opacity-50",
                  )}
                >
                  <Plus className="size-3.5" />
                  {isPending ? "…" : lang === "th" ? "ใช้" : "Use"}
                </button>
              </HiFiCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
