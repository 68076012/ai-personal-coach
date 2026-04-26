"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import {
  Check,
  Circle,
  Dumbbell,
  MessageSquare,
  Plus,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  deletePlanForDate,
  savePlan,
  togglePlanItemDoneAction,
} from "@/app/(app)/dashboard/plan/actions";
import { cn } from "@/lib/utils";
import {
  asMealArray,
  asWorkoutArray,
  emptyMealItem,
  emptyWorkoutItem,
  MEAL_LABELS,
  type MealItem,
  type MealType,
  type WorkoutItem,
} from "@/lib/plan-types";
import type { DailyPlan } from "@/lib/db/schema";

interface Props {
  date: string;
  label: string;
  plan: DailyPlan | null;
  chatPrompt: string;
  autoScroll?: boolean;
}

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

function toNumber(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function num(v: number | null | undefined): string {
  return v === null || v === undefined ? "" : String(v);
}

export function PlanEditor({ date, label, plan, chatPrompt, autoScroll }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // When the user taps a day card on the week/month strip, the page
  // navigates with ?date=YYYY-MM-DD and renders this editor below the
  // strip. Without scrolling, the editor sits below the fold. Auto-
  // scroll into view on first paint for any editor explicitly flagged
  // by the parent (typically the one matching sp.date).
  useEffect(() => {
    if (!autoScroll || !cardRef.current) return;
    // Tiny delay so the parent layout settles before the scroll fires.
    const t = setTimeout(() => {
      cardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 80);
    return () => clearTimeout(t);
  }, [autoScroll]);
  const [workouts, setWorkouts] = useState<WorkoutItem[]>(() =>
    asWorkoutArray(plan?.workout_plan),
  );
  const [meals, setMeals] = useState<MealItem[]>(() =>
    asMealArray(plan?.meal_plan),
  );
  const [notes, setNotes] = useState(plan?.notes ?? "");
  const [pending, startTransition] = useTransition();

  // Local mirror of daily_plans.completion so toggle is instant. Server
  // is source-of-truth; we re-read on mount.
  const initialCompletion = (plan?.completion as
    | { workout_done?: number[]; meal_done?: number[] }
    | null) ?? {};
  const [workoutDone, setWorkoutDone] = useState<Set<number>>(
    () => new Set(initialCompletion.workout_done ?? []),
  );
  const [mealDone, setMealDone] = useState<Set<number>>(
    () => new Set(initialCompletion.meal_done ?? []),
  );

  function toggleDone(kind: "workout" | "meal", index: number) {
    const setSet = kind === "workout" ? setWorkoutDone : setMealDone;
    const current = kind === "workout" ? workoutDone : mealDone;
    const next = !current.has(index);
    setSet((prev) => {
      const out = new Set(prev);
      if (next) out.add(index);
      else out.delete(index);
      return out;
    });
    // Fire-and-forget; revert on error.
    togglePlanItemDoneAction({ date, kind, index, done: next }).catch((err) => {
      setSet((prev) => {
        const out = new Set(prev);
        if (next) out.delete(index);
        else out.add(index);
        return out;
      });
      toast.error(err instanceof Error ? err.message : "Update failed");
    });
  }

  const totals = useMemo(() => {
    return meals.reduce(
      (a, m) => ({
        kcal: a.kcal + (m.kcal ?? 0),
        protein_g: a.protein_g + (m.protein_g ?? 0),
        carb_g: a.carb_g + (m.carb_g ?? 0),
        fat_g: a.fat_g + (m.fat_g ?? 0),
      }),
      { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 },
    );
  }, [meals]);

  function updateWorkout(i: number, patch: Partial<WorkoutItem>) {
    setWorkouts((arr) => arr.map((w, idx) => (idx === i ? { ...w, ...patch } : w)));
  }
  function removeWorkout(i: number) {
    setWorkouts((arr) => arr.filter((_, idx) => idx !== i));
  }
  function addWorkout() {
    setWorkouts((arr) => [...arr, emptyWorkoutItem()]);
  }

  function updateMeal(i: number, patch: Partial<MealItem>) {
    setMeals((arr) => arr.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function removeMeal(i: number) {
    setMeals((arr) => arr.filter((_, idx) => idx !== i));
  }
  function addMeal() {
    const used = new Set(meals.map((m) => m.meal_type));
    const next = MEAL_TYPES.find((t) => !used.has(t)) ?? "snack";
    setMeals((arr) => [...arr, emptyMealItem(next)]);
  }

  function onSave() {
    // Filter out empty rows
    const cleanWorkouts = workouts.filter((w) => w.exercise.trim().length > 0);
    const cleanMeals = meals.filter((m) => m.name.trim().length > 0);
    startTransition(async () => {
      try {
        await savePlan({
          date,
          workout_plan: cleanWorkouts.length ? cleanWorkouts : null,
          meal_plan: cleanMeals.length ? cleanMeals : null,
          notes: notes.trim() || null,
        });
        toast.success("บันทึกแผนแล้ว");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
      }
    });
  }

  function onDeletePlan() {
    if (
      !confirm(
        `ลบแผนของวัน ${date}? — undo ไม่ได้\n\nลบทั้ง workout, เมนู, notes, และเครื่องหมาย done. ใช้เมื่ออยากให้โค้ชวางใหม่.`,
      )
    )
      return;
    startTransition(async () => {
      try {
        const r = await deletePlanForDate({ date });
        if (r.deleted) {
          toast.success(`ลบแผนวัน ${date} แล้ว`);
        } else {
          toast.success("ไม่มีแผนสำหรับวันนั้นอยู่แล้ว");
        }
        // Refresh so the editor re-mounts with empty state
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "ลบไม่สำเร็จ");
      }
    });
  }

  return (
    <Card ref={cardRef}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            {label}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{date}</span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild>
              <Link
                href={`/dashboard/chat?draft=${encodeURIComponent(chatPrompt)}`}
                title="ให้โค้ชช่วยวางแผน"
              >
                <MessageSquare className="size-4" /> ให้โค้ชช่วยวาง
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeletePlan}
              disabled={pending}
              title="ลบแผนของวันนี้"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-4" /> ลบแผน
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Workouts */}
        <section className="space-y-2">
          <div className="flex items-center gap-1.5 text-sm font-medium">
            <Dumbbell className="size-4 text-orange-500" />
            ออกกำลังกาย
          </div>
          {workouts.length === 0 && (
            <p className="text-xs text-muted-foreground">ยังไม่มีท่า — กดปุ่มด้านล่างเพื่อเพิ่ม</p>
          )}
          <div className="space-y-2">
            {workouts.map((w, i) => (
              <WorkoutRow
                key={i}
                value={w}
                done={workoutDone.has(i)}
                onToggleDone={() => toggleDone("workout", i)}
                onChange={(patch) => updateWorkout(i, patch)}
                onRemove={() => removeWorkout(i)}
              />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addWorkout}>
            <Plus className="size-3.5" /> เพิ่มท่า
          </Button>
        </section>

        {/* Meals */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <UtensilsCrossed className="size-4 text-emerald-500" />
              มื้ออาหาร
            </div>
            {meals.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                รวม {Math.round(totals.kcal)} kcal · P{Math.round(totals.protein_g)}/C
                {Math.round(totals.carb_g)}/F{Math.round(totals.fat_g)}g
              </span>
            )}
          </div>
          {meals.length === 0 && (
            <p className="text-xs text-muted-foreground">ยังไม่มีมื้อ — กดปุ่มด้านล่างเพื่อเพิ่ม</p>
          )}
          <div className="space-y-2">
            {meals.map((m, i) => (
              <MealRow
                key={i}
                value={m}
                done={mealDone.has(i)}
                onToggleDone={() => toggleDone("meal", i)}
                onChange={(patch) => updateMeal(i, patch)}
                onRemove={() => removeMeal(i)}
              />
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={addMeal}>
            <Plus className="size-3.5" /> เพิ่มมื้อ
          </Button>
        </section>

        {/* Notes */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium">หมายเหตุ</label>
          <Textarea
            rows={2}
            placeholder="เช่น พักกล้ามเนื้อหลัง, เน้นโปรตีนหลัง workout"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div className="flex justify-end pt-1">
          <Button onClick={onSave} disabled={pending}>
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkoutRow({
  value,
  done,
  onToggleDone,
  onChange,
  onRemove,
}: {
  value: WorkoutItem;
  done: boolean;
  onToggleDone: () => void;
  onChange: (patch: Partial<WorkoutItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn("rounded-md border p-2 space-y-2", done && "opacity-60")}>
      <div className="flex items-center gap-2">
        <DoneCheckbox done={done} onClick={onToggleDone} />
        <Input
          placeholder="ชื่อท่า เช่น Squat"
          value={value.exercise}
          onChange={(e) => onChange({ exercise: e.target.value })}
          className={cn("flex-1", done && "line-through")}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="ลบ"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumberInput
          label="sets"
          value={value.sets}
          onChange={(n) => onChange({ sets: n })}
        />
        <NumberInput
          label="reps"
          value={value.reps}
          onChange={(n) => onChange({ reps: n })}
        />
        <NumberInput
          label="kg"
          value={value.weight_kg}
          onChange={(n) => onChange({ weight_kg: n })}
          step="0.5"
        />
        <NumberInput
          label="นาที"
          value={value.duration_min}
          onChange={(n) => onChange({ duration_min: n })}
        />
      </div>
      <Input
        placeholder="หมายเหตุ (ไม่บังคับ)"
        value={value.notes ?? ""}
        onChange={(e) => onChange({ notes: e.target.value || null })}
        className="text-sm"
      />
    </div>
  );
}

function MealRow({
  value,
  done,
  onToggleDone,
  onChange,
  onRemove,
}: {
  value: MealItem;
  done: boolean;
  onToggleDone: () => void;
  onChange: (patch: Partial<MealItem>) => void;
  onRemove: () => void;
}) {
  return (
    <div className={cn("rounded-md border p-2 space-y-2", done && "opacity-60")}>
      <div className="flex items-center gap-2">
        <DoneCheckbox done={done} onClick={onToggleDone} />
        <select
          value={value.meal_type}
          onChange={(e) => onChange({ meal_type: e.target.value as MealType })}
          className="border-input bg-background h-9 rounded-md border px-2 text-sm shadow-xs"
        >
          {MEAL_TYPES.map((t) => (
            <option key={t} value={t}>
              {MEAL_LABELS[t]}
            </option>
          ))}
        </select>
        <Input
          placeholder="ชื่อเมนู เช่น ไข่ดาว 2 ฟอง + ข้าวกล้อง"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          className={cn("flex-1", done && "line-through")}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={onRemove}
          aria-label="ลบ"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <NumberInput label="kcal" value={value.kcal} onChange={(n) => onChange({ kcal: n })} />
        <NumberInput
          label="P g"
          value={value.protein_g}
          onChange={(n) => onChange({ protein_g: n })}
          step="0.1"
        />
        <NumberInput
          label="C g"
          value={value.carb_g}
          onChange={(n) => onChange({ carb_g: n })}
          step="0.1"
        />
        <NumberInput
          label="F g"
          value={value.fat_g}
          onChange={(n) => onChange({ fat_g: n })}
          step="0.1"
        />
      </div>
    </div>
  );
}

function DoneCheckbox({
  done,
  onClick,
}: {
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={done ? "ทำเสร็จแล้ว — ยกเลิก" : "ทำเสร็จแล้ว"}
      className={cn(
        "size-5 rounded-full inline-flex items-center justify-center shrink-0 transition-colors",
        done
          ? "bg-emerald-500 text-white"
          : "border border-input text-muted-foreground hover:border-foreground/40",
      )}
    >
      {done ? (
        <Check className="size-3" strokeWidth={3} />
      ) : (
        <Circle className="size-3 opacity-0" />
      )}
    </button>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  step = "1",
}: {
  label: string;
  value: number | null | undefined;
  onChange: (n: number | null) => void;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <Input
        type="number"
        inputMode="decimal"
        step={step}
        value={num(value)}
        onChange={(e) => onChange(toNumber(e.target.value))}
        className="h-8 text-sm"
      />
    </label>
  );
}
