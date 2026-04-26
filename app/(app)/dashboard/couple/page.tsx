import Link from "next/link";
import { Sparkles, Star } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { addDays } from "date-fns";
import { getSession } from "@/lib/auth";
import { getCoupleSnapshot } from "@/lib/db/queries";
import { AppBar, HiFiCard, Chip } from "@/components/hifi";
import { getLang } from "@/lib/i18n/server";
import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const TZ = "Asia/Bangkok";

export const dynamic = "force-dynamic";

function startOfWeek(d: Date): Date {
  // Sunday-first week to match COPY.week ordering.
  const out = new Date(d);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

const ACCENT_BG: Record<string, string> = {
  coral: "bg-[var(--coral)]",
  teal: "bg-[var(--teal)]",
};
const ACCENT_TEXT: Record<string, string> = {
  coral: "text-[var(--coral)]",
  teal: "text-[var(--teal)]",
};

export default async function CouplePage() {
  const session = await getSession();
  if (!session.userId) return null;

  const now = new Date();
  const todayDate = formatInTimeZone(now, TZ, "yyyy-MM-dd");
  const weekStart = startOfWeek(now);
  const weekStartDate = formatInTimeZone(weekStart, TZ, "yyyy-MM-dd");
  const weekEndExclusive = formatInTimeZone(addDays(weekStart, 7), TZ, "yyyy-MM-dd");

  const [snapshot, lang] = await Promise.all([
    getCoupleSnapshot({ todayDate, weekStartDate, weekEndDateExclusive: weekEndExclusive }),
    getLang(),
  ]);

  // Build the 7-day week
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return {
      label: t("week", lang)[i],
      date: formatInTimeZone(d, TZ, "yyyy-MM-dd"),
    };
  });

  const [g, m] = snapshot;
  const gName = g.user?.name ?? "Garfield";
  const mName = m.user?.name ?? "Mai";
  const gAccent = (g.user?.accent_color === "teal" ? "teal" : "coral") as "coral" | "teal";
  const mAccent = (m.user?.accent_color === "coral" ? "coral" : "teal") as "coral" | "teal";

  // For each day in the week, who trained?
  const days = weekDays.map((wd) => ({
    ...wd,
    g: g.week_workout_days.includes(wd.date),
    m: m.week_workout_days.includes(wd.date),
  }));
  const bothDays = days.filter((d) => d.g && d.m).length;

  return (
    <>
      <AppBar
        eyebrow={lang === "th" ? "เปรียบเทียบกับคู่" : "Side by side"}
        title={lang === "th" ? "Couple" : "Couple"}
      />
      <div className="mx-auto w-full max-w-3xl px-4 pb-8 space-y-3">
        {/* Heads card */}
        <HiFiCard className="p-5">
          <div className="flex items-center justify-around">
            <Avatar name={gName} accent={gAccent} />
            <div className="text-2xl font-bold tracking-[-0.04em] text-[var(--ink-3)]">
              ×
            </div>
            <Avatar name={mName} accent={mAccent} />
          </div>
        </HiFiCard>

        {/* Versus rows */}
        <HiFiCard className="p-4 space-y-4">
          <VersusRow
            label={t("kcal_today", lang)}
            left={{ name: gName, accent: gAccent, value: `${g.today_kcal}`, sub: g.user?.goal_kcal ? `/ ${g.user.goal_kcal}` : "" }}
            right={{ name: mName, accent: mAccent, value: `${m.today_kcal}`, sub: m.user?.goal_kcal ? `/ ${m.user.goal_kcal}` : "" }}
          />
          <hr className="border-[var(--line)]" />
          <VersusRow
            label={t("weight", lang)}
            left={{
              name: gName, accent: gAccent,
              value: g.latest_weight ? `${g.latest_weight.weight_kg}` : "—",
              sub: g.latest_weight ? "kg" : "",
            }}
            right={{
              name: mName, accent: mAccent,
              value: m.latest_weight ? `${m.latest_weight.weight_kg}` : "—",
              sub: m.latest_weight ? "kg" : "",
            }}
          />
        </HiFiCard>

        {/* Shared training week */}
        <HiFiCard className="p-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">
              {lang === "th" ? "Workout สัปดาห์นี้" : "This week's training"}
            </div>
            {bothDays > 0 && (
              <Chip tone="leaf">
                <Star className="size-3 fill-current" />
                {bothDays} {lang === "th" ? "วันคู่" : "shared"}
              </Chip>
            )}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {days.map((d) => {
              const both = d.g && d.m;
              return (
                <div
                  key={d.date}
                  className={cn(
                    "flex flex-col items-center gap-1.5 rounded-[10px] py-2 px-1",
                    both
                      ? "bg-gradient-to-br from-[var(--coral-soft)] to-[var(--teal-soft)]"
                      : "bg-[var(--surface-2)]",
                  )}
                >
                  <div className="text-[10px] font-semibold text-[var(--ink-3)]">
                    {d.label}
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        d.g ? ACCENT_BG[gAccent] : "bg-[var(--ink-4)]/30",
                      )}
                    />
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        d.m ? ACCENT_BG[mAccent] : "bg-[var(--ink-4)]/30",
                      )}
                    />
                  </div>
                  {both && <Star className="size-3 text-[var(--ink-2)] fill-current" />}
                </div>
              );
            })}
          </div>
        </HiFiCard>

        {/* Coach insight */}
        <HiFiCard className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--accent)]" />
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
              {lang === "th" ? "คำแนะนำจากโค้ช" : "Coach insight"}
            </div>
          </div>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed">
            {bothDays >= 2
              ? lang === "th"
                ? `เทรนพร้อมกัน ${bothDays} วันสัปดาห์นี้ — เก่งมาก ลอง challenge กันต่ออีก 1 วัน?`
                : `${bothDays} shared training days this week — great rhythm. Try one more together?`
              : lang === "th"
                ? "ลองชวนคู่มาเทรนวันเดียวกันสัก 1 วัน — แรงจูงใจดีกว่าฝึกคนเดียว"
                : "Try syncing one workout this week — accountability beats solo motivation"}
          </p>
          <Link
            href={`/dashboard/chat?draft=${encodeURIComponent("ช่วยจัด workout ที่ทำพร้อมกันได้สัปดาห์หน้า")}`}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]"
          >
            {t("ask_coach", lang)} →
          </Link>
        </HiFiCard>
      </div>
    </>
  );
}

function Avatar({ name, accent }: { name: string; accent: "coral" | "teal" }) {
  return (
    <div className="text-center">
      <div
        className={cn(
          "size-16 rounded-full inline-flex items-center justify-center text-white text-2xl font-bold mb-2",
          ACCENT_BG[accent],
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
      <div className={cn("text-sm font-semibold", ACCENT_TEXT[accent])}>{name}</div>
    </div>
  );
}

function VersusRow({
  label,
  left,
  right,
}: {
  label: string;
  left: { name: string; accent: "coral" | "teal"; value: string; sub?: string };
  right: { name: string; accent: "coral" | "teal"; value: string; sub?: string };
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)] text-center mb-2">
        {label}
      </div>
      <div className="grid grid-cols-3 items-baseline">
        <div className="text-center">
          <div
            className={cn(
              "text-2xl font-bold tabular tracking-[-0.04em]",
              ACCENT_TEXT[left.accent],
            )}
          >
            {left.value}
            {left.sub && (
              <span className="ml-1 text-xs font-medium text-[var(--ink-3)]">
                {left.sub}
              </span>
            )}
          </div>
        </div>
        <div className="text-center text-[var(--ink-4)] text-xs">vs</div>
        <div className="text-center">
          <div
            className={cn(
              "text-2xl font-bold tabular tracking-[-0.04em]",
              ACCENT_TEXT[right.accent],
            )}
          >
            {right.value}
            {right.sub && (
              <span className="ml-1 text-xs font-medium text-[var(--ink-3)]">
                {right.sub}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
