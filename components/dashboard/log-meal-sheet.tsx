"use client";

import * as React from "react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { ChevronRight, MessageSquare } from "lucide-react";
import { BottomSheet, HiFiButton } from "@/components/hifi";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { quickLogMeal } from "@/app/(app)/dashboard/actions";
import { type Lang, t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type MealType = "breakfast" | "lunch" | "dinner" | "snack";

const MEAL_TYPES: { key: MealType; emoji: string }[] = [
  { key: "breakfast", emoji: "🍳" },
  { key: "lunch", emoji: "🥗" },
  { key: "dinner", emoji: "🍛" },
  { key: "snack", emoji: "🍎" },
];

function defaultMealType(hourBkk: number): MealType {
  if (hourBkk < 10) return "breakfast";
  if (hourBkk < 14) return "lunch";
  if (hourBkk < 17) return "snack";
  return "dinner";
}

export function LogMealSheet({
  open,
  onOpenChange,
  lang,
  hourBkk,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lang: Lang;
  hourBkk: number;
}) {
  const [mealType, setMealType] = React.useState<MealType>(defaultMealType(hourBkk));
  const [name, setName] = React.useState("");
  const [kcal, setKcal] = React.useState("");
  const [p, setP] = React.useState("");
  const [c, setC] = React.useState("");
  const [f, setF] = React.useState("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setName("");
    setKcal("");
    setP("");
    setC("");
    setF("");
    setMealType(defaultMealType(hourBkk));
  }

  function submit() {
    const k = Number(kcal);
    if (!name.trim() || !Number.isFinite(k) || k <= 0) {
      toast.error(lang === "th" ? "ใส่ชื่อและ kcal ก่อน" : "Need a name and kcal");
      return;
    }
    startTransition(async () => {
      try {
        await quickLogMeal({
          meal_type: mealType,
          food_name: name.trim(),
          kcal: Math.round(k),
          protein_g: Number(p) || 0,
          carb_g: Number(c) || 0,
          fat_g: Number(f) || 0,
        });
        toast.success(`${lang === "th" ? "บันทึกแล้ว" : "Logged"} — ${k} ${t("kcal_short", lang)}`);
        reset();
        onOpenChange(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "log failed");
      }
    });
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("log_meal", lang)}
      description={
        lang === "th"
          ? "รู้ macros อยู่แล้ว? บันทึกตรงๆ ได้เลย"
          : "Know the macros? Log directly."
      }
      footer={
        <>
          <HiFiButton
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {lang === "th" ? "ยกเลิก" : "Cancel"}
          </HiFiButton>
          <HiFiButton
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={pending || !name.trim() || !kcal}
          >
            {pending ? "…" : t("save", lang)}
          </HiFiButton>
        </>
      }
    >
      <div className="space-y-4">
        {/* Meal type */}
        <div className="grid grid-cols-4 gap-1.5">
          {MEAL_TYPES.map((mt) => {
            const active = mt.key === mealType;
            return (
              <button
                key={mt.key}
                onClick={() => setMealType(mt.key)}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 rounded-[10px] text-xs font-medium border transition-colors",
                  active
                    ? "bg-[var(--accent)] text-white border-transparent"
                    : "bg-[var(--surface)] text-[var(--ink-2)] border-[var(--line)]",
                )}
              >
                <span className="text-base">{mt.emoji}</span>
                {t(mt.key, lang)}
              </button>
            );
          })}
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <Label htmlFor="meal-name" className="text-xs">
            {lang === "th" ? "ชื่อเมนู" : "Meal name"}
          </Label>
          <Input
            id="meal-name"
            placeholder={lang === "th" ? "เช่น ข้าวกะเพราไก่" : "e.g. chicken pad ka prao"}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>

        {/* kcal */}
        <div className="space-y-1.5">
          <Label htmlFor="meal-kcal" className="text-xs">
            {t("kcal_short", lang)}
          </Label>
          <Input
            id="meal-kcal"
            type="number"
            inputMode="numeric"
            placeholder="650"
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
          />
        </div>

        {/* P / C / F */}
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="meal-p" className="text-xs">
              {t("protein", lang)}
            </Label>
            <Input
              id="meal-p"
              type="number"
              inputMode="numeric"
              placeholder="30"
              value={p}
              onChange={(e) => setP(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meal-c" className="text-xs">
              {t("carbs", lang)}
            </Label>
            <Input
              id="meal-c"
              type="number"
              inputMode="numeric"
              placeholder="60"
              value={c}
              onChange={(e) => setC(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meal-f" className="text-xs">
              {t("fats", lang)}
            </Label>
            <Input
              id="meal-f"
              type="number"
              inputMode="numeric"
              placeholder="20"
              value={f}
              onChange={(e) => setF(e.target.value)}
            />
          </div>
        </div>

        {/* Escape hatch */}
        <Link
          href={`/dashboard/chat?draft=${encodeURIComponent(name || (lang === "th" ? "กิน..." : "I had..."))}`}
          className="flex items-center justify-between mt-2 px-3 py-2 rounded-[10px] bg-[var(--surface-2)] text-[var(--ink-2)] text-xs"
          onClick={() => onOpenChange(false)}
        >
          <span className="inline-flex items-center gap-2">
            <MessageSquare className="size-3.5 text-[var(--accent)]" />
            {lang === "th"
              ? "ไม่รู้ macros — ให้โค้ชช่วยประมาณ"
              : "Don't know macros — let coach estimate"}
          </span>
          <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </BottomSheet>
  );
}
