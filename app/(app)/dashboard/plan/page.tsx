import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { getSession } from "@/lib/auth";
import { getDailyPlan } from "@/lib/db/queries";
import { PlanEditor } from "@/components/dashboard/plan-editor";
import type { UserId } from "@/lib/db/schema";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;

  const now = new Date();
  const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const tomorrow = formatInTimeZone(addDays(now, 1), TZ, "yyyy-MM-dd");

  const [todayPlan, tomorrowPlan] = await Promise.all([
    getDailyPlan(userId, today).catch(() => null),
    getDailyPlan(userId, tomorrow).catch(() => null),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">แผน</h1>
        <p className="text-sm text-muted-foreground">
          แก้ตรงนี้หรือคุยกับโค้ชในแชทก็ได้ — แผนจะ sync อัตโนมัติ
        </p>
      </header>
      <PlanEditor date={today} label="วันนี้" plan={todayPlan} />
      <PlanEditor date={tomorrow} label="พรุ่งนี้" plan={tomorrowPlan} />
    </main>
  );
}
