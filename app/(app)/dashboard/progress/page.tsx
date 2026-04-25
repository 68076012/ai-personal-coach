import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import {
  getMealsSince,
  getRecentDailyLogs,
  getUser,
  getWorkoutsSince,
} from "@/lib/db/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WeightChart, type WeightPoint } from "@/components/progress/weight-chart";
import { KcalChart, type KcalPoint } from "@/components/progress/kcal-chart";
import {
  WorkoutVolumeChart,
  type VolumePoint,
} from "@/components/progress/workout-volume-chart";
import type { UserId } from "@/lib/db/schema";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

function dateRange(days: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(formatInTimeZone(d, TZ, "yyyy-MM-dd"));
  }
  return out;
}

export default async function ProgressPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [user, weights, meals, workouts] = await Promise.all([
    getUser(userId).catch(() => null),
    getRecentDailyLogs(userId, 90).catch(() => []),
    getMealsSince(userId, since).catch(() => []),
    getWorkoutsSince(userId, since).catch(() => []),
  ]);

  const weightData: WeightPoint[] = weights
    .filter((d) => d.weight_kg !== null)
    .map((d) => ({ date: d.date, weight_kg: d.weight_kg as number }))
    .reverse();

  const last30 = dateRange(30);
  const kcalByDate = new Map<string, number>();
  for (const m of meals) {
    const d = formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd");
    kcalByDate.set(d, (kcalByDate.get(d) ?? 0) + m.kcal);
  }
  const kcalData: KcalPoint[] = last30.map((date) => ({
    date,
    kcal: kcalByDate.get(date) ?? 0,
  }));

  const volumeByDate = new Map<string, number>();
  for (const w of workouts) {
    const d = formatInTimeZone(w.datetime, TZ, "yyyy-MM-dd");
    const volume =
      (w.weight_kg ?? 0) * (w.sets ?? 0) * (w.reps ?? 0);
    if (volume > 0) {
      volumeByDate.set(d, (volumeByDate.get(d) ?? 0) + volume);
    }
  }
  const volumeData: VolumePoint[] = last30.map((date) => ({
    date,
    volume_kg: volumeByDate.get(date) ?? 0,
  }));

  // Streak: consecutive days with at least one log (meal or workout)
  const loggedDates = new Set<string>([
    ...meals.map((m) => formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd")),
    ...workouts.map((w) => formatInTimeZone(w.datetime, TZ, "yyyy-MM-dd")),
  ]);
  let streak = 0;
  for (let i = last30.length - 1; i >= 0; i--) {
    if (loggedDates.has(last30[i])) streak++;
    else break;
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">ความก้าวหน้า</h1>
        <p className="text-sm text-muted-foreground">30 วันที่ผ่านมา</p>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-base font-semibold">Streak</CardTitle>
          <span className="text-xl font-bold tabular-nums">
            {streak}
            <span className="ml-1 text-sm font-normal text-muted-foreground">วัน</span>
          </span>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">น้ำหนัก</CardTitle>
        </CardHeader>
        <CardContent>
          <WeightChart data={weightData} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">แคลอรี่รายวัน</CardTitle>
        </CardHeader>
        <CardContent>
          <KcalChart data={kcalData} goal={user?.goal_kcal ?? null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Volume การฝึก</CardTitle>
        </CardHeader>
        <CardContent>
          <WorkoutVolumeChart data={volumeData} />
        </CardContent>
      </Card>
    </main>
  );
}
