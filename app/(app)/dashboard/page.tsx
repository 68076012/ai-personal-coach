import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import {
  getDailyPlan,
  getDayMacros,
  getMorningReport,
  getRecentMeals,
  getRecentWorkouts,
  getUser,
} from "@/lib/db/queries";
import { TodayPlanCard } from "@/components/dashboard/today-plan-card";
import { MacroRing } from "@/components/dashboard/macro-ring";
import { RecentLogs } from "@/components/dashboard/recent-logs";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UserId } from "@/lib/db/schema";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const now = new Date();
  const todayDate = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const dayStart = new Date(`${todayDate}T00:00:00+07:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  // Resilient against DB outages: if any call fails, fall back to safe defaults.
  const [user, plan, macros, meals, workouts, report] = await Promise.all([
    getUser(userId).catch(() => null),
    getDailyPlan(userId, todayDate).catch(() => null),
    getDayMacros(userId, dayStart, dayEnd).catch(() => ({
      kcal: 0,
      protein_g: 0,
      carb_g: 0,
      fat_g: 0,
    })),
    getRecentMeals(userId, 8).catch(() => []),
    getRecentWorkouts(userId, 8).catch(() => []),
    getMorningReport(userId, todayDate).catch(() => null),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          สวัสดี {user?.name ?? userId}
        </h1>
        <p className="text-sm text-muted-foreground">
          {formatInTimeZone(now, TZ, "EEEEที่ d MMMM yyyy")}
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            มาโครวันนี้
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-3">
            <MacroRing label="kcal" value={macros.kcal} goal={user?.goal_kcal ?? null} unit="" accent="kcal" />
            <MacroRing label="P" value={macros.protein_g} goal={user?.goal_protein_g ?? null} unit="g" accent="protein" />
            <MacroRing label="C" value={macros.carb_g} goal={user?.goal_carb_g ?? null} unit="g" accent="carb" />
            <MacroRing label="F" value={macros.fat_g} goal={user?.goal_fat_g ?? null} unit="g" accent="fat" />
          </div>
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">สรุปเช้านี้</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {report.summary_md}
            </pre>
          </CardContent>
        </Card>
      )}

      <TodayPlanCard plan={plan} />

      <QuickActions />

      <RecentLogs meals={meals} workouts={workouts} />
    </main>
  );
}
