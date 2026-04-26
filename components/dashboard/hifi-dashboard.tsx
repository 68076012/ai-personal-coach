"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { formatInTimeZone } from "date-fns-tz";

const TZ = "Asia/Bangkok";
import {
  ChevronRight,
  Dumbbell,
  Flame,
  RotateCcw,
  Soup,
  Sparkles,
  Sun,
  TrendingUp,
  UtensilsCrossed,
  Check,
  Circle,
  X,
} from "lucide-react";
import { deleteLogEntry, repeatMealLog, restoreLogEntry } from "@/app/(app)/dashboard/actions";
import { HiFiCard, Chip, Bar, BigNum, AppBar, HiFiButton } from "@/components/hifi";
import { LogMealSheet } from "@/components/dashboard/log-meal-sheet";
import { LogWeightSheet } from "@/components/dashboard/log-weight-sheet";
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
  repeatCandidate: Meal | null;
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
  repeatCandidate,
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
  const [weightSheetOpen, setWeightSheetOpen] = React.useState(false);

  // Animated kcal hero — count up briefly so the dashboard feels alive on landing.
  const [animKcal, setAnimKcal] = React.useState(0);
  React.useEffect(() => {
    const tm = setTimeout(() => setAnimKcal(macros.kcal), 80);
    return () => clearTimeout(tm);
  }, [macros.kcal]);
  const animPct = goalKcal > 0 ? Math.max(0, Math.min(100, (animKcal / goalKcal) * 100)) : 0;

  // Today plan preview = first 2 meals + first 1 workout from plan, with
  // their plan-array indices preserved so tap-to-check writes back to the
  // right slot on daily_plans.completion.
  const planMeals = (plan?.meal_plan as Array<{ name?: string; meal_type?: string; kcal?: number }> | null) ?? [];
  const planWorkouts = (plan?.workout_plan as Array<{
    exercise?: string;
    sets?: number;
    reps?: number;
    weight_kg?: number;
    duration_min?: number;
  }> | null) ?? [];
  const completion = (plan?.completion as
    | { workout_done?: number[]; meal_done?: number[] }
    | null) ?? {};
  const mealDone = new Set(completion.meal_done ?? []);
  const workoutDone = new Set(completion.workout_done ?? []);
  // Today's focus = every meal + every workout from the plan, in plan
  // order. Indices match the array positions on daily_plans so the
  // tap-to-check writes back to the right slot. Each item is its own
  // tickable row — no slicing, no grouping.
  const previewItems = [
    ...planMeals.map((m, i) => ({
      kind: "meal" as const,
      index: i,
      name: m.name ?? "?",
      meta: m.kcal ? `${m.kcal} ${t("kcal_short", lang)}` : "",
      done: mealDone.has(i),
    })),
    ...planWorkouts.map((w, i) => ({
      kind: "workout" as const,
      index: i,
      name: w.exercise ?? "?",
      meta: [
        w.sets ? `${w.sets}×${w.reps ?? "?"}` : "",
        w.weight_kg ? `${w.weight_kg}kg` : "",
        w.duration_min ? `${w.duration_min}min` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      done: workoutDone.has(i),
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

        {/* Repeat-yesterday suggestion strip — only shows when there's a
            yesterday meal of the current-hour's meal_type AND the user
            hasn't already logged that slot today. One-tap copy. */}
        {repeatCandidate && (
          <RepeatStrip candidate={repeatCandidate} lang={lang} />
        )}

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
          <HiFiButton
            size="tile"
            type="button"
            onClick={() => setWeightSheetOpen(true)}
          >
            <TrendingUp className="size-5 text-[var(--sky)]" />
            <span>{t("log_weight", lang)}</span>
          </HiFiButton>
        </div>

        {/* Macros */}
        <HiFiCard className="p-4 space-y-3.5">
          <MacroRow label={t("protein", lang)} value={Math.round(macros.protein_g)} goal={user.goal_protein_g} color="leaf" />
          <MacroRow label={t("carbs", lang)}   value={Math.round(macros.carb_g)}    goal={user.goal_carb_g}    color="sun" />
          <MacroRow label={t("fats", lang)}    value={Math.round(macros.fat_g)}     goal={user.goal_fat_g}     color="coral" />
        </HiFiCard>

        {/* Quick-plan row — links to chat with prefilled drafts so the user
            can spin up a plan without navigating to /dashboard/plan first.
            Same drafts the Plan page's Quick start card uses, mirrored here
            for one-tap access on the home dashboard. */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <HiFiButton size="sm" asChild>
            <Link
              href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผนวันนี้ — workout + เมนูทั้งวัน")}`}
            >
              <Sparkles className="size-4 text-[var(--accent)]" />
              <span>{t("plan_today", lang)}</span>
            </Link>
          </HiFiButton>
          <HiFiButton size="sm" asChild>
            <Link
              href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผน 7 วันถัดไป — เมนูทั้งวัน + workout split, เรียก propose_plan_bulk รอบเดียวเป็น draft")}`}
            >
              <Sparkles className="size-4 text-[var(--accent)]" />
              <span>{t("plan_week", lang)}</span>
            </Link>
          </HiFiButton>
        </div>

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
              <PlanPreviewItem
                key={`${it.kind}-${i}`}
                kind={it.kind}
                index={it.index}
                name={it.name}
                meta={it.meta}
                done={it.done}
                date={todayDate}
                lang={lang}
              />
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
                  time={formatInTimeZone(m.datetime, TZ, "HH:mm")}
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
                  time={formatInTimeZone(w.datetime, TZ, "HH:mm")}
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
      <LogWeightSheet
        open={weightSheetOpen}
        onOpenChange={setWeightSheetOpen}
        lang={lang}
        initialWeight={user.current_weight_kg ?? null}
      />
    </>
  );
}

function PlanPreviewItem({
  kind,
  name,
  meta,
  done,
}: {
  kind: "meal" | "workout";
  index: number;
  name: string;
  meta: string;
  done: boolean;
  date: string;
  lang: Lang;
}) {
  // Read-only mirror — Plan page is the single editing surface for
  // ticking items off. Same daily_plans.completion column, so checks
  // applied on /plan show up here on next render.
  return (
    <div
      className={cn(
        "w-full p-3 flex items-center gap-3 rounded-[var(--r-lg)] border bg-[var(--surface)]",
        "border-[var(--line)]",
        done && "opacity-60",
      )}
    >
      <div
        className={cn(
          "size-9 rounded-[10px] flex items-center justify-center shrink-0",
          kind === "workout"
            ? "bg-[var(--sun-soft)] text-[#8a6712]"
            : "bg-[var(--leaf-soft)] text-[var(--leaf)]",
        )}
      >
        {kind === "workout" ? <Dumbbell className="size-4" /> : <UtensilsCrossed className="size-4" />}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            "text-sm font-medium truncate text-[var(--ink)]",
            done && "line-through",
          )}
        >
          {name}
        </div>
        {meta && <div className="text-xs text-[var(--ink-3)] mt-0.5">{meta}</div>}
      </div>
      {done ? (
        <div className="size-5 rounded-full bg-[var(--leaf)] text-white inline-flex items-center justify-center shrink-0">
          <Check className="size-3" strokeWidth={3} />
        </div>
      ) : (
        <Circle className="size-5 text-[var(--ink-4)] shrink-0" />
      )}
    </div>
  );
}
// suppress unused
void HiFiCard;

function RepeatStrip({ candidate, lang }: { candidate: Meal; lang: Lang }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = React.useState(false);

  function onTap() {
    if (pending) return;
    startTransition(async () => {
      try {
        const r = await repeatMealLog({ source_id: candidate.id });
        setDone(true);
        toast.success(
          lang === "th"
            ? `เพิ่ม ${candidate.food_name} แล้ว — ${r.kcal} ${t("kcal_short", lang)}`
            : `Logged ${candidate.food_name} — ${r.kcal} ${t("kcal_short", lang)}`,
        );
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Repeat failed");
      }
    });
  }

  if (done) return null;

  const mealLabel = t(candidate.meal_type as "breakfast" | "lunch" | "dinner" | "snack", lang);

  return (
    <button
      type="button"
      onClick={onTap}
      disabled={pending}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-[14px] text-left transition-colors disabled:opacity-60",
        "border border-[var(--accent)]/30 bg-[var(--accent-soft)] active:scale-[0.99]",
      )}
    >
      <div className="size-9 rounded-[10px] bg-[var(--accent)] text-white inline-flex items-center justify-center shrink-0">
        <RotateCcw className="size-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
          {lang === "th" ? `ซ้ำ${mealLabel}เมื่อวาน` : `Repeat yesterday's ${mealLabel.toLowerCase()}`}
        </div>
        <div className="text-sm font-semibold text-[var(--ink)] truncate">
          {candidate.food_name}
        </div>
        <div className="text-xs text-[var(--ink-3)] tabular">
          {candidate.kcal} {t("kcal_short", lang)} · P{Math.round(candidate.protein_g)}g
        </div>
      </div>
      <ChevronRight className="size-4 text-[var(--accent)] shrink-0" />
    </button>
  );
}

function RecentLogRow({
  id,
  table,
  icon,
  title,
  time,
  meta,
  lang,
}: {
  id: string;
  table: "meals" | "workouts";
  icon: "meal" | "workout";
  title: string;
  time?: string;
  meta: string;
  lang: Lang;
}) {
  const [pending, startTransition] = useTransition();
  const [hidden, setHidden] = React.useState(false);

  function onDelete() {
    startTransition(async () => {
      try {
        const r = await deleteLogEntry({ table, id });
        setHidden(true);
        // Friendlier than window.confirm — sonner action toast with 5s undo.
        toast.success(lang === "th" ? "ลบแล้ว" : "Deleted", {
          duration: 5000,
          action: {
            label: lang === "th" ? "เลิกทำ" : "Undo",
            onClick: async () => {
              try {
                await restoreLogEntry({ table, row: r.row });
                setHidden(false);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Undo failed");
              }
            },
          },
        });
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
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-medium truncate">{title}</div>
          {time && (
            <span className="text-[10px] tabular text-[var(--ink-3)] shrink-0">
              {time}
            </span>
          )}
        </div>
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
