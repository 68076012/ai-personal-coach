"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { savePlan } from "@/app/(app)/dashboard/plan/actions";
import type { DailyPlan } from "@/lib/db/schema";

interface Props {
  date: string;
  label: string;
  plan: DailyPlan | null;
}

function tryParse(input: string): unknown {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined; // signal parse failure
  }
}

export function PlanEditor({ date, label, plan }: Props) {
  const [workout, setWorkout] = useState(
    plan?.workout_plan ? JSON.stringify(plan.workout_plan, null, 2) : "",
  );
  const [meals, setMeals] = useState(
    plan?.meal_plan ? JSON.stringify(plan.meal_plan, null, 2) : "",
  );
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [pending, startTransition] = useTransition();

  function onSave() {
    const w = tryParse(workout);
    const m = tryParse(meals);
    if (w === undefined) {
      toast.error("workout JSON ผิด");
      return;
    }
    if (m === undefined) {
      toast.error("meals JSON ผิด");
      return;
    }
    startTransition(async () => {
      try {
        await savePlan({
          date,
          workout_plan: w,
          meal_plan: m,
          notes: notes.trim() || null,
        });
        toast.success("บันทึกแล้ว");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">
          {label} <span className="ml-2 text-xs font-normal text-muted-foreground">{date}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium">Workout (JSON array)</label>
          <Textarea
            rows={6}
            placeholder='[{"exercise":"Squat","sets":4,"reps":8,"weight_kg":80}]'
            value={workout}
            onChange={(e) => setWorkout(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Meals (JSON array)</label>
          <Textarea
            rows={6}
            placeholder='[{"meal_type":"breakfast","name":"ไข่ดาว 2 ฟอง + ข้าวกล้อง","kcal":420}]'
            value={meals}
            onChange={(e) => setMeals(e.target.value)}
            className="font-mono text-xs"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium">Notes</label>
          <Textarea
            rows={2}
            placeholder="หมายเหตุ"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button onClick={onSave} disabled={pending} size="sm">
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
