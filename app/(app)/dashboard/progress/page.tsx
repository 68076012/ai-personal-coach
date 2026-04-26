import Link from "next/link";
import { Users } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import {
  getMealsSince,
  getRecentDailyLogs,
  getUser,
  getWorkoutsSince,
} from "@/lib/db/queries";
import { AppBar, HiFiCard } from "@/components/hifi";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { WeightChart, type WeightPoint } from "@/components/progress/weight-chart";
import { KcalChart, type KcalPoint } from "@/components/progress/kcal-chart";
import {
  WorkoutVolumeChart,
  type VolumePoint,
} from "@/components/progress/workout-volume-chart";
import { RangePicker, type RangeDays } from "@/components/progress/range-picker";
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

function parseRange(raw: string | undefined): RangeDays {
  if (raw === "7" || raw === "30" || raw === "90") return Number(raw) as RangeDays;
  return 30;
}

export default async function ProgressPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const session = await getSession();
  if (!session.userId) return null;
  const userId = session.userId as UserId;
  const sp = await searchParams;
  const range = parseRange(sp.range);

  const since = new Date();
  since.setDate(since.getDate() - range);

  const [user, weights, meals, workouts, lang] = await Promise.all([
    getUser(userId).catch(() => null),
    getRecentDailyLogs(userId, Math.max(range, 90)).catch(() => []),
    getMealsSince(userId, since).catch(() => []),
    getWorkoutsSince(userId, since).catch(() => []),
    getLang(),
  ]);

  const weightData: WeightPoint[] = weights
    .filter((d) => d.weight_kg !== null)
    .map((d) => ({ date: d.date, weight_kg: d.weight_kg as number }))
    .reverse()
    .slice(-range);

  const dates = dateRange(range);
  const kcalByDate = new Map<string, number>();
  for (const m of meals) {
    const d = formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd");
    kcalByDate.set(d, (kcalByDate.get(d) ?? 0) + m.kcal);
  }
  const kcalData: KcalPoint[] = dates.map((date) => ({
    date,
    kcal: kcalByDate.get(date) ?? 0,
  }));

  const volumeByDate = new Map<string, number>();
  for (const w of workouts) {
    const d = formatInTimeZone(w.datetime, TZ, "yyyy-MM-dd");
    const volume = (w.weight_kg ?? 0) * (w.sets ?? 0) * (w.reps ?? 0);
    if (volume > 0) {
      volumeByDate.set(d, (volumeByDate.get(d) ?? 0) + volume);
    }
  }
  const volumeData: VolumePoint[] = dates.map((date) => ({
    date,
    volume_kg: volumeByDate.get(date) ?? 0,
  }));

  // Streak: consecutive days from today with at least one log of any kind.
  const loggedDates = new Set<string>([
    ...meals.map((m) => formatInTimeZone(m.datetime, TZ, "yyyy-MM-dd")),
    ...workouts.map((w) => formatInTimeZone(w.datetime, TZ, "yyyy-MM-dd")),
  ]);
  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (loggedDates.has(dates[i])) streak++;
    else break;
  }

  return (
    <>
      <AppBar
        eyebrow={lang === "th" ? `${range} วันล่าสุด` : `Last ${range} days`}
        title={t("progress", lang)}
        right={<RangePicker current={range} />}
      />
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 space-y-3">
        {/* Streak */}
        <HiFiCard className="flex items-center justify-between p-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {t("streak", lang)}
            </div>
            <div className="text-xs text-[var(--ink-3)] mt-1">
              {lang === "th" ? "วันต่อเนื่องที่บันทึก" : "Consecutive logged days"}
            </div>
          </div>
          <div className="text-3xl font-bold tabular text-[var(--ink)] tracking-[-0.03em]">
            {streak}
            <span className="ml-1 text-sm font-medium text-[var(--ink-3)]">
              {t("days", lang)}
            </span>
          </div>
        </HiFiCard>

        {/* Weight */}
        <HiFiCard className="p-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {t("weight", lang)}
          </div>
          <WeightChart data={weightData} />
        </HiFiCard>

        {/* Kcal */}
        <HiFiCard className="p-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {lang === "th" ? "แคลอรี่รายวัน" : "Daily calories"}
          </div>
          <KcalChart data={kcalData} goal={user?.goal_kcal ?? null} />
        </HiFiCard>

        {/* Volume */}
        <HiFiCard className="p-4 space-y-2">
          <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
            {lang === "th" ? "Volume การฝึก" : "Training volume"}
          </div>
          <WorkoutVolumeChart data={volumeData} />
        </HiFiCard>

        {/* Couple link */}
        <Link
          href="/dashboard/couple"
          className="flex items-center justify-between p-4 rounded-[var(--r-lg)] border border-[var(--line)] bg-[var(--surface)] mt-3"
        >
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)] inline-flex items-center justify-center">
              <Users className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-[var(--ink)]">
                {lang === "th" ? "ดู Couple view" : "Couple view"}
              </div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">
                {lang === "th"
                  ? "เปรียบเทียบกับคู่ของคุณ"
                  : "Compare with your partner"}
              </div>
            </div>
          </div>
          <span className="text-[var(--ink-3)] text-lg">→</span>
        </Link>
      </div>
    </>
  );
}
