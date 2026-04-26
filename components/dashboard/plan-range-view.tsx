"use client";

import Link from "next/link";
import { CalendarDays, Dumbbell, MessageSquare, PauseCircle, UtensilsCrossed } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { asMealArray, asWorkoutArray } from "@/lib/plan-types";
import type { DailyPlan } from "@/lib/db/schema";

interface DayItem {
  date: string;
  weekday: string;
  monthDay: string;
  isToday: boolean;
  plan: DailyPlan | null;
}

interface Props {
  days: DayItem[];
  layout: "week" | "month";
  selectedDate?: string;
  bulkPrompt: string;
  goalKcal?: number | null;
}

export function PlanRangeView({ days, layout, selectedDate, bulkPrompt, goalKcal }: Props) {
  const cardClass =
    layout === "month"
      ? "grid grid-cols-7 gap-1.5"
      : "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-7";

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <CalendarDays className="mt-0.5 size-4 shrink-0 text-violet-500" />
          <div className="text-sm">
            <p className="font-medium">
              {layout === "week" ? "วางแผนทั้งสัปดาห์" : "วางแผนทั้งเดือน"}ในรอบเดียว
            </p>
            <p className="text-xs text-muted-foreground">
              {layout === "week"
                ? "บอกโค้ชว่าอยากเน้นอะไร แล้วโค้ชจะวาง 7 วันให้พร้อมกัน"
                : "เหมาะกับการลด/เพิ่มน้ำหนักระยะยาว — โค้ชจะแบ่ง phase ให้"}
            </p>
          </div>
        </div>
        <Button size="sm" asChild>
          <Link href={`/dashboard/chat?draft=${encodeURIComponent(bulkPrompt)}`}>
            <MessageSquare className="size-4" />
            ให้โค้ชช่วยวาง
          </Link>
        </Button>
      </div>

      <div className={cardClass}>
        {days.map((d) => (
          <DayCell
            key={d.date}
            day={d}
            compact={layout === "month"}
            selected={selectedDate === d.date}
            goalKcal={goalKcal}
          />
        ))}
      </div>
    </div>
  );
}

function DayCell({
  day,
  compact,
  selected,
  goalKcal,
}: {
  day: DayItem;
  compact: boolean;
  selected: boolean;
  goalKcal?: number | null;
}) {
  const meals = asMealArray(day.plan?.meal_plan);
  const workouts = asWorkoutArray(day.plan?.workout_plan);
  const paused = day.plan?.workout_paused ?? false;
  const empty = meals.length === 0 && workouts.length === 0 && !paused;
  const planKcal = meals.reduce((s, m) => s + (m.kcal ?? 0), 0);
  const kcalDelta = goalKcal && planKcal > 0 ? planKcal - goalKcal : null;
  const kcalTone =
    kcalDelta === null
      ? "text-muted-foreground"
      : Math.abs(kcalDelta) <= (goalKcal ?? 0) * 0.1
        ? "text-emerald-600 dark:text-emerald-400"
        : kcalDelta > 0
          ? "text-rose-600 dark:text-rose-400"
          : "text-amber-600 dark:text-amber-400";

  if (compact) {
    return (
      <Link
        href={`/dashboard/plan?date=${day.date}`}
        className={`flex flex-col items-stretch gap-0.5 rounded-md border p-1.5 text-[11px] transition-colors hover:border-foreground/30 ${
          selected
            ? "border-primary bg-primary/5"
            : day.isToday
              ? "border-orange-500/40 bg-orange-500/5"
              : "bg-card"
        } ${empty ? "opacity-60" : ""}`}
      >
        <div className="flex items-baseline justify-between leading-none">
          <span className="font-semibold">{day.monthDay}</span>
          <span className="text-[10px] text-muted-foreground">{day.weekday}</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {paused ? (
            <PauseCircle className="size-3 text-amber-500" />
          ) : workouts.length > 0 ? (
            <span className="inline-flex items-center gap-0.5">
              <Dumbbell className="size-3 text-orange-500" />
              {workouts.length}
            </span>
          ) : null}
          {meals.length > 0 && (
            <span className="inline-flex items-center gap-0.5">
              <UtensilsCrossed className="size-3 text-emerald-500" />
              {meals.length}
            </span>
          )}
        </div>
        {planKcal > 0 && (
          <div className={`mt-0.5 text-[9px] tabular-nums ${kcalTone}`}>
            {planKcal} kcal
          </div>
        )}
      </Link>
    );
  }

  return (
    <Card
      className={`transition-colors ${
        selected
          ? "border-primary"
          : day.isToday
            ? "border-orange-500/40"
            : ""
      }`}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              {day.weekday}
            </div>
            <div className="text-base font-semibold">{day.monthDay}</div>
          </div>
          {day.isToday && (
            <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-medium text-orange-700 dark:text-orange-300">
              วันนี้
            </span>
          )}
        </div>

        <div className="space-y-1 text-xs">
          {paused ? (
            <div className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300">
              <PauseCircle className="size-3.5" /> หยุด workout
            </div>
          ) : workouts.length > 0 ? (
            <div className="flex items-start gap-1 text-muted-foreground">
              <Dumbbell className="mt-0.5 size-3 shrink-0 text-orange-500" />
              <span className="line-clamp-2">
                {workouts.map((w) => w.exercise).slice(0, 3).join(", ")}
                {workouts.length > 3 ? `, +${workouts.length - 3}` : ""}
              </span>
            </div>
          ) : (
            <div className="text-muted-foreground/60">— ยังไม่มี workout</div>
          )}
          {meals.length > 0 ? (
            <div className="flex items-start gap-1 text-muted-foreground">
              <UtensilsCrossed className="mt-0.5 size-3 shrink-0 text-emerald-500" />
              <span className="line-clamp-2">
                {meals.map((m) => m.name).slice(0, 3).join(", ")}
                {meals.length > 3 ? `, +${meals.length - 3}` : ""}
              </span>
            </div>
          ) : (
            <div className="text-muted-foreground/60">— ยังไม่มีเมนู</div>
          )}
          {planKcal > 0 && (
            <div className={`tabular-nums text-[11px] ${kcalTone}`}>
              ~{planKcal} kcal
              {goalKcal && (
                <span className="text-muted-foreground">
                  {" "}/ {goalKcal} เป้า
                  {kcalDelta !== null && (
                    <> · {kcalDelta > 0 ? "+" : ""}{kcalDelta}</>
                  )}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-1.5 pt-1">
          <Button asChild variant="outline" size="sm" className="h-7 flex-1 text-xs">
            <Link href={`/dashboard/plan?date=${day.date}`}>แก้</Link>
          </Button>
          <Button asChild variant="ghost" size="sm" className="h-7 px-2 text-xs">
            <Link
              href={`/dashboard/chat?draft=${encodeURIComponent(`ช่วยวางแผนวัน ${day.date} ให้หน่อย — workout + เมนู`)}`}
              title="ให้โค้ชช่วย"
            >
              <MessageSquare className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
