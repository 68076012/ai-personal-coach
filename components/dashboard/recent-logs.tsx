import { formatDistanceToNow } from "date-fns";
import { th } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Apple, Dumbbell } from "lucide-react";
import type { Meal, Workout } from "@/lib/db/schema";

type Item =
  | { kind: "meal"; data: Meal }
  | { kind: "workout"; data: Workout };

export function RecentLogs({
  meals,
  workouts,
  limit = 6,
}: {
  meals: Meal[];
  workouts: Workout[];
  limit?: number;
}) {
  const items: Item[] = [
    ...meals.map((m) => ({ kind: "meal" as const, data: m })),
    ...workouts.map((w) => ({ kind: "workout" as const, data: w })),
  ]
    .sort((a, b) => b.data.datetime.getTime() - a.data.datetime.getTime())
    .slice(0, limit);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">บันทึกล่าสุด</CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            ยังไม่มี log วันนี้ — เริ่มที่มื้อเช้ามั้ย?
          </p>
        ) : (
          <ul className="space-y-2.5">
            {items.map((item) => {
              const ago = formatDistanceToNow(new Date(item.data.datetime), {
                addSuffix: true,
                locale: th,
              });
              if (item.kind === "meal") {
                return (
                  <li key={`m-${item.data.id}`} className="flex items-start gap-2 text-sm">
                    <Apple className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                    <div className="flex-1">
                      <div className="font-medium">{item.data.food_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {item.data.kcal} kcal • P{Math.round(item.data.protein_g)}g •{" "}
                        {ago}
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <li key={`w-${item.data.id}`} className="flex items-start gap-2 text-sm">
                  <Dumbbell className="mt-0.5 size-4 shrink-0 text-orange-500" />
                  <div className="flex-1">
                    <div className="font-medium">{item.data.exercise}</div>
                    <div className="text-xs text-muted-foreground">
                      {item.data.sets && item.data.reps
                        ? `${item.data.sets}x${item.data.reps}`
                        : ""}
                      {item.data.weight_kg ? ` @ ${item.data.weight_kg}kg` : ""}
                      {item.data.duration_min ? ` ${item.data.duration_min} นาที` : ""}
                      {" • "}
                      {ago}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
