import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dumbbell, UtensilsCrossed } from "lucide-react";
import type { DailyPlan } from "@/lib/db/schema";

interface WorkoutItem {
  exercise: string;
  sets?: number;
  reps?: number;
  weight_kg?: number;
  duration_min?: number;
  notes?: string;
}

interface MealItem {
  meal_type: string;
  name: string;
  kcal?: number;
  protein_g?: number;
}

const MEAL_LABELS: Record<string, string> = {
  breakfast: "เช้า",
  lunch: "กลางวัน",
  dinner: "เย็น",
  snack: "ของว่าง",
};

export function TodayPlanCard({ plan }: { plan: DailyPlan | null }) {
  const updatedLabel = plan?.updated_at
    ? formatDistanceToNow(new Date(plan.updated_at), { addSuffix: true, locale: th })
    : null;

  const workouts = (plan?.workout_plan as WorkoutItem[] | null) ?? [];
  const meals = (plan?.meal_plan as MealItem[] | null) ?? [];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-semibold">แผนวันนี้</CardTitle>
        {updatedLabel && (
          <span className="text-xs text-muted-foreground">อัพเดท {updatedLabel}</span>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <section>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <Dumbbell className="size-4 text-orange-500" />
            ออกกำลังกาย
          </div>
          {workouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีแผน — บอกโค้ชให้ช่วยวางได้</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {workouts.map((w, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="font-medium">{w.exercise}</span>
                  <span className="text-muted-foreground">
                    {w.sets && w.reps && `${w.sets}x${w.reps}`}
                    {w.weight_kg ? ` @ ${w.weight_kg}kg` : ""}
                    {w.duration_min ? ` ${w.duration_min} นาที` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-medium">
            <UtensilsCrossed className="size-4 text-emerald-500" />
            มื้ออาหาร
          </div>
          {meals.length === 0 ? (
            <p className="text-sm text-muted-foreground">ยังไม่มีแผน — ลองถามโค้ชว่า “วันนี้กินอะไรดี”</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {meals.map((m, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span>
                    <span className="text-xs text-muted-foreground mr-1.5">
                      [{MEAL_LABELS[m.meal_type] ?? m.meal_type}]
                    </span>
                    <span className="font-medium">{m.name}</span>
                  </span>
                  {m.kcal && (
                    <span className="text-xs text-muted-foreground tabular-nums">{m.kcal} kcal</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {plan?.notes && (
          <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">{plan.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
