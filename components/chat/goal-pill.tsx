import Link from "next/link";
import { Target, Pencil } from "lucide-react";

export function GoalPill({
  goal,
  goalKcal,
  goalProtein,
}: {
  goal: string | null;
  goalKcal: number | null;
  goalProtein: number | null;
}) {
  const hasGoal = goal && goal.trim().length > 0;

  return (
    <Link
      href="/dashboard/settings"
      className="group sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-background/95 px-4 py-2 text-sm backdrop-blur"
      title="แก้ไขเป้าหมาย"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Target className="size-4 shrink-0 text-emerald-600" />
        <span className="truncate text-muted-foreground">
          {hasGoal ? (
            <>
              <span className="font-medium text-foreground">{goal}</span>
              {(goalKcal || goalProtein) && (
                <span className="ml-2 text-xs">
                  ({goalKcal ? `${goalKcal} kcal` : ""}
                  {goalKcal && goalProtein ? " · " : ""}
                  {goalProtein ? `P ${goalProtein}g` : ""})
                </span>
              )}
            </>
          ) : (
            <span>ยังไม่ได้ตั้งเป้าหมาย — แตะเพื่อตั้ง</span>
          )}
        </span>
      </div>
      <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-50 group-hover:opacity-100" />
    </Link>
  );
}
