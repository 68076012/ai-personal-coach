"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Soup,
  Sparkles,
  X,
} from "lucide-react";
import {
  approvePendingPlan,
  rejectPendingPlan,
} from "@/app/(app)/dashboard/plan/actions";
import { Chip } from "@/components/hifi";
import { cn } from "@/lib/utils";
import { asMealArray, asWorkoutArray } from "@/lib/plan-types";
import { type Lang } from "@/lib/i18n";

export interface ToolEvent {
  tool: string;
  args?: unknown;
  result: { ok: boolean; data?: unknown; error?: string };
}

function getDate(args: unknown): string | null {
  if (args && typeof args === "object" && "date" in args) {
    const v = (args as { date?: unknown }).date;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  }
  return null;
}

interface CardProps {
  event: ToolEvent;
  lang: Lang;
}

// Renders the right inline card per tool-name. Falls back to a small
// monochrome strip for unknown tools so the chat never goes silent on a
// new tool we haven't styled yet.
export function HiFiToolCard({ event, lang }: CardProps) {
  if (!event.result.ok) {
    return (
      <div className="rounded-[12px] border border-[var(--coral)]/30 bg-[var(--coral-soft)] px-3 py-2 text-xs text-[var(--coral)] flex items-center gap-2">
        <X className="size-3.5" />
        <span className="font-mono">{event.tool}</span>
        {event.result.error && <span className="opacity-80">— {event.result.error}</span>}
      </div>
    );
  }
  switch (event.tool) {
    case "propose_plan_bulk":
      return <ProposePlanBulkCard event={event} lang={lang} />;
    case "propose_meals":
      return <ProposeMealsCard event={event} lang={lang} />;
    case "update_plan":
      return <UpdatePlanCard event={event} lang={lang} />;
    case "save_meal":
      return <SaveMealCard event={event} lang={lang} />;
    case "log_meal":
    case "log_workout":
    case "update_memory":
    case "update_profile":
    case "find_saved_meal":
    case "search_memory":
    case "get_history":
    case "get_history_summary":
    case "get_plan":
      // These either run silently (lookups) or have their effect summarized
      // in the assistant's text. Show a tiny one-liner pill.
      return <SilentToolPill event={event} />;
    default:
      return <SilentToolPill event={event} />;
  }
}

// ============================================================================
// propose_plan_bulk — the heavy one. Shows expandable day-by-day + Apply/Reject.
// ============================================================================
function ProposePlanBulkCard({ event, lang }: CardProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = useTransition();
  const [decision, setDecision] = React.useState<"approved" | "rejected" | null>(null);

  const data = event.result.data as
    | { pending_id?: string; count?: number; dates?: string[]; status?: string; review_url?: string }
    | undefined;
  const pendingId = data?.pending_id;
  const count = data?.count ?? 0;
  const first = data?.dates?.[0];
  const last = data?.dates?.[data?.dates.length - 1];

  // Parse the args.plans[] for the day-by-day preview.
  const argPlans =
    (event.args as { plans?: Array<{ date: string; workout_plan?: unknown; meal_plan?: unknown; notes?: string }> })
      ?.plans ?? [];

  function onApprove() {
    if (!pendingId) return;
    startTransition(async () => {
      try {
        const r = await approvePendingPlan({ id: pendingId });
        toast.success(
          lang === "th" ? `Approved — เขียน ${r.applied} วัน` : `Approved — ${r.applied} days written`,
        );
        setDecision("approved");
        // Refresh the chat page's RSC payload so other surfaces (the
        // dashboard's Today plan + Plan page) re-render with the freshly
        // applied daily_plans rows next time the user navigates to them.
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Approve failed");
      }
    });
  }
  function onReject() {
    if (!pendingId) return;
    startTransition(async () => {
      try {
        await rejectPendingPlan({ id: pendingId });
        toast.success(lang === "th" ? "ปฏิเสธแผนแล้ว" : "Rejected");
        setDecision("rejected");
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Reject failed");
      }
    });
  }

  const decided = decision !== null;

  return (
    <div
      className={cn(
        "rounded-[14px] border-2 px-3 py-2.5 space-y-2",
        decision === "approved" && "border-[var(--leaf)] bg-[var(--leaf-soft)]",
        decision === "rejected" && "border-[var(--ink-4)] bg-[var(--surface-2)] opacity-70",
        !decided && "border-[var(--accent)]/40 bg-[var(--accent-soft)]",
      )}
    >
      <div className="flex items-start gap-2">
        <Sparkles
          className={cn(
            "size-4 mt-0.5 shrink-0",
            decision === "approved" ? "text-[var(--leaf)]" : "text-[var(--accent)]",
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--ink)]">
            {decision === "approved"
              ? lang === "th" ? "Apply แล้ว" : "Plan applied"
              : decision === "rejected"
                ? lang === "th" ? "ปฏิเสธแผนแล้ว" : "Plan rejected"
                : lang === "th" ? `แผน ${count} วัน · รอตกลง` : `${count}-day plan · awaiting approval`}
          </div>
          <div className="text-[11px] text-[var(--ink-3)] mt-0.5">
            {first && last ? (first === last ? first : `${first} → ${last}`) : ""}
          </div>
        </div>
      </div>

      {!decided && argPlans.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full inline-flex items-center justify-between text-[11px] text-[var(--ink-3)] py-1 px-2 rounded border border-dashed border-[var(--accent)]/30 hover:bg-[var(--surface)]/50"
        >
          <span>{open
            ? lang === "th" ? "ซ่อนรายละเอียด" : "Hide details"
            : lang === "th" ? "ดูทีละวัน" : "Day by day"}
          </span>
          {open ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </button>
      )}

      {open && argPlans.length > 0 && (
        <ul className="space-y-1.5">
          {argPlans.map((p) => (
            <DayPreviewLi key={p.date} day={p} />
          ))}
        </ul>
      )}

      {!decided && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={onReject}
            disabled={pending || !pendingId}
            className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-full border border-[var(--line)] bg-[var(--surface)] text-xs font-semibold text-[var(--ink-2)] disabled:opacity-50"
          >
            <X className="size-3.5" /> {lang === "th" ? "ปฏิเสธ" : "Reject"}
          </button>
          <button
            onClick={onApprove}
            disabled={pending || !pendingId}
            className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-full bg-[var(--accent)] text-white text-xs font-semibold disabled:opacity-50"
          >
            <Check className="size-3.5" /> {lang === "th" ? "Apply" : "Apply"}
          </button>
        </div>
      )}

      {decision === "approved" && (
        <Link
          href="/dashboard/plan"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--leaf)]"
        >
          {lang === "th" ? "ดูในหน้าแผน" : "Open Plan"} <ExternalLink className="size-3" />
        </Link>
      )}
    </div>
  );
}

function DayPreviewLi({
  day,
}: {
  day: { date: string; workout_plan?: unknown; meal_plan?: unknown; notes?: string };
}) {
  const meals = asMealArray(day.meal_plan);
  const workouts = asWorkoutArray(day.workout_plan);
  return (
    <li className="rounded-[10px] bg-[var(--surface)] border border-[var(--line)] px-2.5 py-1.5 text-[11px]">
      <div className="font-mono font-semibold text-[var(--ink-2)] mb-0.5">{day.date}</div>
      {workouts.length > 0 && (
        <div className="text-[var(--ink-3)]">
          <span className="text-[var(--ink)] font-semibold">W:</span>{" "}
          {workouts.map((w) => w.exercise).slice(0, 4).join(", ")}
        </div>
      )}
      {meals.length > 0 && (
        <div className="text-[var(--ink-3)]">
          <span className="text-[var(--ink)] font-semibold">M:</span>{" "}
          {meals.map((m) => m.name).slice(0, 4).join(", ")}
        </div>
      )}
    </li>
  );
}

// ============================================================================
// Smaller cards for single-day actions
// ============================================================================
function ProposeMealsCard({ event, lang }: CardProps) {
  const date = getDate(event.args);
  const data = event.result.data as { count?: number } | undefined;
  return (
    <Link
      href={date ? `/dashboard/plan?date=${date}` : "/dashboard/plan"}
      className="flex items-center gap-2 rounded-[10px] border border-[var(--leaf)]/30 bg-[var(--leaf-soft)] px-2.5 py-1.5 text-xs"
    >
      <Soup className="size-3.5 text-[var(--leaf)]" />
      <span className="text-[var(--ink-2)]">
        {lang === "th" ? "บันทึกเมนู" : "Saved menu"}
        {data?.count ? ` ${data.count} ${lang === "th" ? "รายการ" : "items"}` : ""}
        {date ? ` · ${date}` : ""}
      </span>
      <ExternalLink className="ml-auto size-3 text-[var(--leaf)]" />
    </Link>
  );
}

function UpdatePlanCard({ event, lang }: CardProps) {
  const date = getDate(event.args);
  return (
    <Link
      href={date ? `/dashboard/plan?date=${date}` : "/dashboard/plan"}
      className="flex items-center gap-2 rounded-[10px] border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-2.5 py-1.5 text-xs"
    >
      <CalendarCheck className="size-3.5 text-[var(--accent)]" />
      <span className="text-[var(--ink-2)]">
        {lang === "th" ? "อัพเดทแผน" : "Plan updated"}
        {date ? ` · ${date}` : ""}
      </span>
      <ExternalLink className="ml-auto size-3 text-[var(--accent)]" />
    </Link>
  );
}

function SaveMealCard({ event, lang }: CardProps) {
  const data = event.result.data as { name?: string } | undefined;
  return (
    <Link
      href="/dashboard/library"
      className="flex items-center gap-2 rounded-[10px] border border-[var(--coral)]/30 bg-[var(--coral-soft)] px-2.5 py-1.5 text-xs"
    >
      <Soup className="size-3.5 text-[var(--coral)]" />
      <span className="text-[var(--ink-2)] truncate">
        {lang === "th" ? "บันทึกเข้า library" : "Saved to library"}
        {data?.name ? ` · ${data.name}` : ""}
      </span>
      <ExternalLink className="ml-auto size-3 text-[var(--coral)]" />
    </Link>
  );
}

function SilentToolPill({ event }: { event: ToolEvent }) {
  return (
    <Chip tone="neutral" className="text-[10px] py-0.5">
      <Check className="size-2.5 text-[var(--leaf)]" />
      <span className="font-mono">{event.tool}</span>
    </Chip>
  );
}
