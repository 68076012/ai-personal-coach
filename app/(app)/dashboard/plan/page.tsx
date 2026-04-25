import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { MessageSquare, Sparkles } from "lucide-react";
import { getSession } from "@/lib/auth";
import { getDailyPlan } from "@/lib/db/queries";
import { PlanEditor } from "@/components/dashboard/plan-editor";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
          แก้แต่ละท่า/มื้อตรงนี้เลย หรือบอกโค้ชในแชทก็ได้ — แผนจะ sync ให้อัตโนมัติ
        </p>
      </header>

      <Card className="bg-muted/30">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-violet-500" />
            <div className="text-sm">
              <p className="font-medium">ยังไม่รู้จะวางยังไง?</p>
              <p className="text-muted-foreground">
                ให้โค้ชช่วยวางตามเป้าหมาย แล้วค่อยมาแก้ตรงนี้ทีหลังได้
              </p>
            </div>
          </div>
          <div className="flex gap-2 sm:shrink-0">
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผนวันนี้ให้หน่อย — workout + เมนูทั้งวัน")}`}
              >
                <MessageSquare className="size-4" /> วันนี้
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยวางแผนพรุ่งนี้ให้หน่อย — workout + เมนูทั้งวัน")}`}
              >
                <MessageSquare className="size-4" /> พรุ่งนี้
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <PlanEditor
        date={today}
        label="วันนี้"
        plan={todayPlan}
        chatPrompt="ช่วยวางแผนวันนี้ให้หน่อย — workout + เมนูทั้งวัน"
      />
      <PlanEditor
        date={tomorrow}
        label="พรุ่งนี้"
        plan={tomorrowPlan}
        chatPrompt="ช่วยวางแผนพรุ่งนี้ให้หน่อย — workout + เมนูทั้งวัน"
      />
    </main>
  );
}
