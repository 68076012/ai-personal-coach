import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { MessageSquare, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import {
  getActivePendingPlans,
  getDailyPlansBetween,
  getDailyPlan,
  getUser,
} from "@/lib/db/queries";
import { PlanEditor } from "@/components/dashboard/plan-editor";
import { PlanRangeView } from "@/components/dashboard/plan-range-view";
import { PendingPlanBanner } from "@/components/dashboard/pending-plan-banner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DailyPlan, UserId } from "@/lib/db/schema";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

const WEEKDAY_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

function buildDayList(
  startDate: Date,
  numDays: number,
  todayDate: string,
  plansByDate: Map<string, DailyPlan>,
) {
  const out: {
    date: string;
    weekday: string;
    monthDay: string;
    isToday: boolean;
    plan: DailyPlan | null;
  }[] = [];
  for (let i = 0; i < numDays; i++) {
    const d = addDays(startDate, i);
    const date = formatInTimeZone(d, TZ, "yyyy-MM-dd");
    const wIdx = parseInt(formatInTimeZone(d, TZ, "i"), 10) % 7;
    const dayNum = parseInt(formatInTimeZone(d, TZ, "d"), 10);
    const monthIdx = parseInt(formatInTimeZone(d, TZ, "M"), 10) - 1;
    out.push({
      date,
      weekday: WEEKDAY_TH[(wIdx + 1) % 7],
      monthDay: `${dayNum} ${MONTH_TH[monthIdx]}`,
      isToday: date === todayDate,
      plan: plansByDate.get(date) ?? null,
    });
  }
  return out;
}

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; tab?: string }>;
}) {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;
  const sp = await searchParams;

  const now = new Date();
  const today = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const tomorrow = formatInTimeZone(addDays(now, 1), TZ, "yyyy-MM-dd");

  const requestedDate =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const tab = sp.tab && ["today", "week", "month"].includes(sp.tab) ? sp.tab : "today";

  const monthEnd = formatInTimeZone(addDays(now, 31), TZ, "yyyy-MM-dd");

  const [plans, selectedPlan, tomorrowPlan, pendingPlans, user] = await Promise.all([
    getDailyPlansBetween(userId, today, monthEnd).catch(() => []),
    getDailyPlan(userId, requestedDate).catch(() => null),
    getDailyPlan(userId, tomorrow).catch(() => null),
    getActivePendingPlans(userId).catch(() => []),
    getUser(userId).catch(() => null),
  ]);
  const goalKcal = user?.goal_kcal ?? null;

  const plansByDate = new Map<string, DailyPlan>(
    plans.map((p) => [p.date as string, p as DailyPlan]),
  );
  const weekDays = buildDayList(now, 7, today, plansByDate);
  const monthDays = buildDayList(now, 28, today, plansByDate);

  const editorLabel =
    requestedDate === today
      ? "วันนี้"
      : requestedDate === tomorrow
        ? "พรุ่งนี้"
        : `วันที่ ${requestedDate}`;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6 space-y-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">แผน</h1>
        <p className="text-sm text-muted-foreground">
          วางทีละวัน, ทั้งสัปดาห์, หรือทั้งเดือน — โค้ชช่วยตามจังหวะที่คุณต้องการ
        </p>
      </header>

      {pendingPlans.length > 0 && (
        <div className="space-y-3">
          {pendingPlans.map((p) => (
            <PendingPlanBanner key={p.id} pending={p} />
          ))}
        </div>
      )}

      <Card className="bg-muted/30">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-500" />
            <div className="text-sm">
              <p className="font-medium">เริ่มต้นง่ายๆ</p>
              <p className="text-muted-foreground">
                ให้โค้ชช่วยวางตามเป้าหมาย ของในครัว และเวลาว่างที่ตั้งไว้ในตั้งค่า
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผนวันนี้ — workout + เมนูทั้งวัน")}`}
              >
                <MessageSquare className="size-4" /> วันนี้
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผน 7 วันถัดไป — เมนูทั้งวัน + workout split (เรียก propose_meals และ update_plan ทีละวัน)")}`}
              >
                <MessageSquare className="size-4" /> 7 วัน
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผน 1 เดือน — แบ่งเป็น 4 สัปดาห์ progressive ทั้ง workout และเมนู สอดคล้องกับงบและของในครัว")}`}
              >
                <MessageSquare className="size-4" /> 1 เดือน
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="today">วันนี้</TabsTrigger>
          <TabsTrigger value="week">สัปดาห์</TabsTrigger>
          <TabsTrigger value="month">เดือน</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4">
          <PlanEditor
            date={today}
            label="วันนี้"
            plan={plansByDate.get(today) ?? null}
            chatPrompt="ช่วยวางแผนวันนี้ให้หน่อย — workout + เมนูทั้งวัน"
          />
          <PlanEditor
            date={tomorrow}
            label="พรุ่งนี้"
            plan={tomorrowPlan}
            chatPrompt="ช่วยวางแผนพรุ่งนี้ให้หน่อย — workout + เมนูทั้งวัน"
          />
        </TabsContent>

        <TabsContent value="week" className="space-y-4">
          <PlanRangeView
            days={weekDays}
            layout="week"
            selectedDate={requestedDate}
            goalKcal={goalKcal}
            bulkPrompt="ช่วยวางแผน 7 วันถัดไปให้หน่อย — workout split + เมนูทั้งวัน เรียก propose_plan_bulk รอบเดียว (จะเป็น draft รอ approve) คำนึงถึง goal kcal, ของในครัว, งบประมาณ"
          />
          {(requestedDate !== today || sp.date) && (
            <PlanEditor
              date={requestedDate}
              label={editorLabel}
              plan={selectedPlan}
              chatPrompt={`ช่วยวางแผนวัน ${requestedDate} — workout + เมนูทั้งวัน`}
            />
          )}
        </TabsContent>

        <TabsContent value="month" className="space-y-4">
          <PlanRangeView
            days={monthDays}
            layout="month"
            selectedDate={requestedDate}
            goalKcal={goalKcal}
            bulkPrompt="ช่วยวางแผน 1 เดือน — แบ่ง 4 สัปดาห์ progressive (W1 base, W2 build, W3 push, W4 deload). เรียก propose_plan_bulk เป็น draft รอ approve. เก็บเป้าหมาย structural (เช่น 'squat +5kg ภายในสิ้นเดือน') ใน update_memory ด้วย key 'goal_month_YYYYMM_<slug>'"
          />
          {sp.date && (
            <PlanEditor
              date={requestedDate}
              label={editorLabel}
              plan={selectedPlan}
              chatPrompt={`ช่วยวางแผนวัน ${requestedDate} — workout + เมนูทั้งวัน`}
            />
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
