"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, ChevronUp, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  approvePendingPlan,
  rejectPendingPlan,
} from "@/app/(app)/dashboard/plan/actions";
import { asMealArray, asWorkoutArray } from "@/lib/plan-types";
import type { PendingPlan, PendingPlanDay } from "@/lib/db/schema";

interface Props {
  pending: PendingPlan;
}

export function PendingPlanBanner({ pending }: Props) {
  const [open, setOpen] = useState(false);
  const [pendingTx, startTransition] = useTransition();

  const days = (pending.plans as PendingPlanDay[]) ?? [];
  const dateRange =
    days.length === 0
      ? ""
      : days.length === 1
        ? days[0].date
        : `${days[0].date} → ${days[days.length - 1].date}`;
  const sourceLabel = formatSource(pending.source);

  function onApprove() {
    startTransition(async () => {
      try {
        const r = await approvePendingPlan({ id: pending.id });
        toast.success(`Approve แล้ว — เขียน ${r.applied} วันเข้าตารางแผน`);
      } catch (err) {
        toast.error(
          err instanceof Error ? `Approve ไม่สำเร็จ: ${err.message}` : "Approve ไม่สำเร็จ",
        );
      }
    });
  }

  function onReject() {
    startTransition(async () => {
      try {
        await rejectPendingPlan({ id: pending.id });
        toast.success("ปฏิเสธแผนแล้ว");
      } catch (err) {
        toast.error(
          err instanceof Error ? `Reject ไม่สำเร็จ: ${err.message}` : "Reject ไม่สำเร็จ",
        );
      }
    });
  }

  return (
    <Card className="border-violet-500/40 bg-violet-500/5">
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-500" />
            <div className="text-sm">
              <p className="font-medium">
                โค้ชเสนอแผน {days.length} วัน — รอ approve
              </p>
              <p className="text-xs text-muted-foreground">
                {dateRange}
                {sourceLabel ? ` · จาก ${sourceLabel}` : ""}
              </p>
              {pending.reason && (
                <p className="mt-1 text-xs italic text-muted-foreground">
                  เหตุผล: {pending.reason}
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              disabled={pendingTx}
            >
              <X className="size-4" /> ปฏิเสธ
            </Button>
            <Button size="sm" onClick={onApprove} disabled={pendingTx}>
              <Check className="size-4" /> Approve
            </Button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between rounded border border-dashed border-violet-500/30 px-3 py-1.5 text-xs text-muted-foreground hover:bg-violet-500/5"
        >
          <span>{open ? "ซ่อนรายละเอียด" : "ดูรายละเอียดทีละวัน"}</span>
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>

        {open && (
          <ul className="space-y-2">
            {days.map((d) => (
              <DayPreview key={d.date} day={d} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function DayPreview({ day }: { day: PendingPlanDay }) {
  const meals = asMealArray(day.meal_plan);
  const workouts = asWorkoutArray(day.workout_plan);
  const totalKcal = meals.reduce((s, m) => s + (m.kcal ?? 0), 0);

  return (
    <li className="rounded border bg-background p-2 text-xs">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-mono font-semibold">{day.date}</span>
        {totalKcal > 0 && (
          <span className="tabular-nums text-muted-foreground">
            ~{Math.round(totalKcal)} kcal
          </span>
        )}
      </div>
      {workouts.length > 0 && (
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Workout:</span>{" "}
          {workouts
            .map(
              (w) =>
                `${w.exercise}${w.sets ? ` ${w.sets}x${w.reps ?? "?"}` : ""}${w.weight_kg ? ` @${w.weight_kg}kg` : ""}`,
            )
            .join(", ")}
        </div>
      )}
      {meals.length > 0 && (
        <div className="text-muted-foreground">
          <span className="font-medium text-foreground">Meals:</span>{" "}
          {meals.map((m) => `${m.name}${m.kcal ? ` (${m.kcal})` : ""}`).join(", ")}
        </div>
      )}
      {day.notes && (
        <div className="text-muted-foreground/80">
          <span className="font-medium">Notes:</span> {day.notes}
        </div>
      )}
    </li>
  );
}

function formatSource(s: string): string {
  const map: Record<string, string> = {
    "chat:trainer": "Trainer",
    "chat:meal_designer": "Meal Designer",
    "chat:nutritionist": "Nutritionist",
    "cron:nightly": "นัดวางแผนกลางคืน",
    chat: "Chat",
  };
  return map[s] ?? s;
}
