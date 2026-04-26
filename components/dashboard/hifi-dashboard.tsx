"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ChevronRight,
  Dumbbell,
  Flame,
  Soup,
  Sparkles,
  Sun,
  TrendingUp,
  UtensilsCrossed,
  Check,
  Circle,
  X,
} from "lucide-react";
import { deleteLogEntry } from "@/app/(app)/dashboard/actions";
import { HiFiCard, Chip, Bar, BigNum, AppBar, HiFiButton } from "@/components/hifi";
import { LogMealSheet } from "@/components/dashboard/log-meal-sheet";
import { t, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import type { DailyPlan, Meal, MorningReport, User, Workout } from "@/lib/db/schema";

const TZ_LABEL = {
  th: { fmtMonth: ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."],
        fmtDow:   ["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัสบดี","ศุกร์","เสาร์"] },
  en: { fmtMonth: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
        fmtDow:   ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"] },
} as const;

function timeOfDay(hourBkk: number): "morning" | "day" | "evening" {
  if (hourBkk < 11) return "morning";
  if (hourBkk < 17) return "day";
  return "evening";
}

interface Props {
  lang: Lang;
  user: User;
  todayDate: string;
  hourBkk: number;
  macros: { kcal: number; protein_g: number; carb_g: number; fat_g: number };
  meals: Meal[];
  workouts: Workout[];
  plan: DailyPlan | null;
  report: MorningReport | null;
  streakDays: number;
}

export function HiFiDashboard({
  lang,
  user,
  todayDate,
  hourBkk,
  macros,
  meals,
  workouts,
  plan,
  report,
  streakDays,
}: Props) {
  // Date eyebrow
  const d = new Date(todayDate + "T00:00:00+07:00");
  const dow = TZ_LABEL[lang].fmtDow[d.getDay()];
  const monthName = TZ_LABEL[lang].fmtMonth[d.getMonth()];
  const dateLine =
    lang === "th"
      ? `${dow} ${d.getDate()} ${monthName}`
      : `${dow}, ${d.getDate()} ${monthName}`;

  const tod = timeOfDay(hourBkk);
  const greet =
    tod === "morning" ? t("greeting_morning", lang)
    : tod === "evening" ? t("greeting_evening", lang)
    : t("greeting_day", lang);

  const goalKcal = user.goal_kcal ?? 0;
  const remaining = goalKcal - macros.kcal;
  const pct = goalKcal > 0 ? Math.max(0, Math.min(100, Math.round((macros.kcal / goalKcal) * 100))) : 0;

  const [sheetOpen, setSheetOpen] = React.useState(false);

  // Animated kcal hero — count up briefly so the dashboard feels alive on landing.
  const [animKcal, setAnimKcal] = React.useState(0);
  React.useEffect(() => {
    const tm = setTimeout(() => setAnimKcal(macros.kcal), 80);
    return () => clearTimeout(tm);
  }, [macros.kcal]);
  const animPct = goalKcal > 0 ? Math.max(0, Math.min(100, (animKcal / goalKcal) * 100)) : 0;

  // Today plan preview = first 2 meals + first 1 workout from plan, then any
  // logged today on top so user sees "what's done vs queued"
  const planMeals = (plan?.meal_plan as Array<{ name?: string; meal_type?: string; kcal?: number }> | null) ?? [];
  const planWorkouts = (plan?.workout_plan as Array<{ exercise?: string; sets?: number; reps?: number }> | null) ?? [];
  const previewItems = [
    ...planMeals.slice(0, 2).map((m) => ({
      kind: "meal" as const,
      name: m.name ?? "?",
      meta: m.kcal ? `${m.kcal} ${t("kcal_short", lang)}` : "",
      done: false,
    })),
    ...planWorkouts.slice(0, 1).map((w) => ({
      kind: "workout" as const,
      name: w.exercise ?? "?",
      meta: w.sets ? `${w.sets}×${w.reps ?? "?"}` : "",
      done: false,
    })),
  ];

  return (
    <>
      <AppBar
        eyebrow={dateLine}
        title={`${greet}, ${user.name}`}
        right={
          <Link
            href="/dashboard/settings"
            className="inline-flex size-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-sm font-semibold border border-[var(--accent)]/40"
            aria-label={t("settings", lang)}
          >
            {user.name.charAt(0).toUpperCase()}
          </Link>
        }
      />

      <div className="px-4 pb-6 space-y-4">
        {/* Morning report — show only if generated and time is morning. */}
        {report && tod === "morning" && (
          <MorningReportInline report={report} lang={lang} />
        )}

        {/* Hero — big kcal */}
        <section className="flex flex-col items-center pt-2 pb-4 text-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-2">
            {t("kcal_today", lang)}
          </div>
          <div className="flex items-baseline justify-center gap-1">
            <BigNum value={animKcal} />
            {goalKcal > 0 && (
              <span className="text-lg font-medium text-[var(--ink-3)] whitespace-nowrap">
                / {goalKcal}
              </span>
            )}
          </div>
          <div className="mt-2.5 flex justify-center gap-2 flex-wrap">
            {goalKcal > 0 && (
              <Chip tone="accent">
                {remaining > 0
                  ? `${remaining} ${t("kcal_short", lang)} ${t("remaining", lang)}`
                  : `${Math.abs(remaining)} over`}
              </Chip>
            )}
            {streakDays > 0 && (
              <Chip tone="leaf">
                <Flame className="size-3" /> {streakDays} {t("days", lang)}
              </Chip>
            )}
          </div>

          {/* Ring */}
          <div className="relative mt-4 w-[200px] h-[200px]">
            <svg
              viewBox="0 0 100 100"
              width={200}
              height={200}
              className="-rotate-90"
            >
              <circle cx="50" cy="50" r="44" fill="none" stroke="var(--surface-2)" strokeWidth="6" />
              <circle
                cx="50"
                cy="50"
                r="44"
                fill="none"
                stroke="var(--accent)"
                strokeWidth="6"
                strokeDasharray={`${animPct * 2.764} 1000`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 1s cubic-bezier(.2,.8,.2,1)" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[36px] font-bold tracking-[-0.03em] tabular text-[var(--ink)] leading-none">
                {Math.round(animPct)}
                <span className="text-lg font-medium text-[var(--ink-3)]">%</span>
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                {t("of_goal", lang)}
              </div>
            </div>
          </div>
        </section>

        {/* Quick-log tiles. Log meal opens a BottomSheet form (skip the
            chat round-trip when macros are known); workout + weight
            still drop into chat with a prefilled draft because the
            agent's better at parsing "Squat 80kg 5x5" than a 6-field
            form. */}
        <div className="grid grid-cols-3 gap-2">
          <HiFiButton
            size="tile"
            type="button"
            onClick={() => setSheetOpen(true)}
          >
            <UtensilsCrossed className="size-5 text-[var(--leaf)]" />
            <span>{t("log_meal", lang)}</span>
          </HiFiButton>
          <HiFiButton size="tile" asChild>
            <Link href={`/dashboard/chat?draft=${encodeURIComponent("ออกกำลัง...")}`}>
              <Dumbbell className="size-5 text-[var(--sun)]" />
              <span>{t("log_workout", lang)}</span>
            </Link>
          </HiFiButton>
          <HiFiButton size="tile" asChild>
            <Link href={`/dashboard/chat?draft=${encodeURIComponent("น้ำหนักวันนี้...")}`}>
              <TrendingUp className="size-5 text-[var(--sky)]" />
              <span>{t("log_weight", lang)}</span>
            </Link>
          </HiFiButton>
        </div>

        {/* Macros */}
        <HiFiCard className="p-4 space-y-3.5">
          <MacroRow label={t("protein", lang)} value={Math.round(macros.protein_g)} goal={user.goal_protein_g} color="leaf" />
          <MacroRow label={t("carbs", lang)}   value={Math.round(macros.carb_g)}    goal={user.goal_carb_g}    color="sun" />
          <MacroRow label={t("fats", lang)}    value={Math.round(macros.fat_g)}     goal={user.goal_fat_g}     color="coral" />
        </HiFiCard>

        {/* Today plan preview */}
        <div className="flex items-center justify-between px-1.5 pt-1">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {t("today_focus", lang)}
          </div>
          <Link
            href="/dashboard/plan"
            className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)]"
          >
            {t("plan", lang)} <ChevronRight className="size-4" />
          </Link>
        </div>
        <div className="space-y-2">
          {previewItems.length > 0 ? (
            previewItems.map((it, i) => (
              <HiFiCard key={i} className="p-3 flex items-center gap-3">
                <div
                  className={cn(
                    "size-9 rounded-[10px] flex items-center justify-center shrink-0",
                    it.kind === "workout"
                      ? "bg-[var(--sun-soft)] text-[#8a6712]"
                      : "bg-[var(--leaf-soft)] text-[var(--leaf)]",
                  )}
                >
                  {it.kind === "workout" ? <Dumbbell className="size-4" /> : <UtensilsCrossed className="size-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate text-[var(--ink)]">{it.name}</div>
                  {it.meta && <div className="text-xs text-[var(--ink-3)] mt-0.5">{it.meta}</div>}
                </div>
                {it.done ? (
                  <Check className="size-4 text-[var(--leaf)] shrink-0" />
                ) : (
                  <Circle className="size-4 text-[var(--ink-4)] shrink-0" />
                )}
              </HiFiCard>
            ))
          ) : (
            <HiFiCard className="p-5 text-center text-[13px] text-[var(--ink-3)]">
              {lang === "th" ? "ยังไม่มีแผนวันนี้ — แตะ \"แผน\" เพื่อให้โค้ชช่วย" : 'No plan today — tap Plan to have the coach lay one out'}
            </HiFiCard>
          )}
        </div>

        {/* Recent logs (last 3) */}
        {meals.length + workouts.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] px-1.5">
              {lang === "th" ? "ล่าสุด" : "Recent"}
            </div>
            <div className="space-y-2">
              {meals.slice(0, 2).map((m) => (
                <RecentLogRow
                  key={m.id}
                  id={m.id}
                  table="meals"
                  icon="meal"
                  title={m.food_name}
                  meta={`${m.kcal} ${t("kcal_short", lang)} · P${Math.round(m.protein_g)}g`}
                  lang={lang}
                />
              ))}
              {workouts.slice(0, 1).map((w) => (
                <RecentLogRow
                  key={w.id}
                  id={w.id}
                  table="workouts"
                  icon="workout"
                  title={w.exercise}
                  meta={`${w.sets ?? "?"}×${w.reps ?? "?"}${w.weight_kg ? ` @ ${w.weight_kg}kg` : ""}`}
                  lang={lang}
                />
              ))}
            </div>
          </div>
        )}

        {/* Ask coach pill */}
        <Link
          href="/dashboard/chat"
          className="flex items-center justify-between h-13 px-4 mt-2 rounded-[14px] bg-[var(--surface-2)] text-[var(--ink-3)] text-sm font-medium"
        >
          <span className="inline-flex items-center gap-2.5">
            <Sparkles className="size-4 text-[var(--accent)]" />
            {t("ask_coach", lang)}
          </span>
          <ChevronRight className="size-4" />
        </Link>
      </div>

      <LogMealSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        lang={lang}
        hourBkk={hourBkk}
      />
    </>
  );
}

function RecentLogRow({
  id,
  table,
  icon,
  title,
  meta,
  lang,
}: {
  id: string;
  table: "meals" | "workouts";
  icon: "meal" | "workout";
  title: string;
  meta: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = React.useState(false);

  function onDelete() {
    if (!confirm(lang === "th" ? "ลบรายการนี้? undo ไม่ได้" : "Delete this entry? Undo is not available.")) return;
    startTransition(async () => {
      try {
        await deleteLogEntry({ table, id });
        setHidden(true);
        toast.success(lang === "th" ? "ลบแล้ว" : "Deleted");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Delete failed");
      }
    });
  }

  if (hidden) return null;

  return (
    <HiFiCard className="p-3 flex items-center gap-3">
      <div
        className={cn(
          "size-9 rounded-[10px] flex items-center justify-center shrink-0",
          icon === "workout"
            ? "bg-[var(--sun-soft)] text-[#8a6712]"
            : "bg-[var(--leaf-soft)] text-[var(--leaf)]",
        )}
      >
        {icon === "workout" ? <Dumbbell className="size-4" /> : <UtensilsCrossed className="size-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{title}</div>
        <div className="text-xs text-[var(--ink-3)]">{meta}</div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={pending}
        aria-label={lang === "th" ? "ลบ" : "Delete"}
        className="size-7 rounded-full inline-flex items-center justify-center text-[var(--ink-4)] hover:bg-[var(--surface-2)] hover:text-[var(--coral)] transition-colors shrink-0 disabled:opacity-50"
      >
        <X className="size-3.5" />
      </button>
    </HiFiCard>
  );
}

function MacroRow({
  label,
  value,
  goal,
  color,
}: {
  label: string;
  value: number;
  goal: number | null;
  color: "leaf" | "sun" | "coral";
}) {
  return (
    <div>
      <div className="flex justify-between mb-1.5">
        <span className="text-xs font-medium text-[var(--ink-2)]">{label}</span>
        <span className="text-xs text-[var(--ink-3)] tabular">
          <b className="text-[var(--ink)] font-semibold">{value}</b>
          {goal ? ` / ${goal}g` : "g"}
        </span>
      </div>
      <Bar value={value} max={goal ?? Math.max(1, value)} color={color} />
    </div>
  );
}

function MorningReportInline({ report, lang }: { report: MorningReport; lang: Lang }) {
  const [dismissed, setDismissed] = React.useState(false);
  if (dismissed) return null;

  const firstLine =
    (report.summary_md || "").split("\n").find((l) => l.trim()) ?? "";

  return (
    <HiFiCard
      className="overflow-hidden p-4 relative border-[var(--accent-soft)]"
      style={{
        background:
          "linear-gradient(135deg, var(--accent-soft), var(--surface) 80%)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-8 -right-8 size-30 rounded-full bg-[var(--accent)] opacity-[0.06]"
      />
      <div className="flex items-center gap-2 mb-2 relative">
        <div className="size-7 rounded-[10px] bg-[var(--accent)] text-white inline-flex items-center justify-center">
          <Sun className="size-4" />
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
          {t("morning_report", lang)}
        </div>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDismissed(true);
          }}
          aria-label={t("close", lang)}
          className="text-[var(--ink-3)] p-1.5"
        >
          ✕
        </button>
      </div>
      <Link href="/dashboard/morning" className="block relative">
        <div className="text-sm text-[var(--ink-2)] leading-relaxed whitespace-pre-wrap">
          {firstLine || (
            <span className="italic text-[var(--ink-3)]">
              {lang === "th" ? "(ยังไม่มีรายงาน)" : "(No report yet)"}
            </span>
          )}
        </div>
        <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)]">
          {lang === "th" ? "ดูเต็ม ✨" : "View full ✨"}
          <ChevronRight className="size-3.5" />
        </div>
      </Link>
    </HiFiCard>
  );
}
