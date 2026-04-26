"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { db, schema } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import {
  approvePendingPlan as approvePendingPlanQuery,
  rejectPendingPlan as rejectPendingPlanQuery,
  setWorkoutPaused,
  togglePlanItemDone,
  upsertDailyPlan,
} from "@/lib/db/queries";
import { PlanSchema } from "@/lib/plan-types";
import type { UserId } from "@/lib/db/schema";

const SavePlanInput = z
  .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  .and(PlanSchema);

export async function savePlan(input: z.infer<typeof SavePlanInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = SavePlanInput.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { date, workout_plan, meal_plan, notes } = parsed.data;
  await upsertDailyPlan({
    user_id: session.userId as UserId,
    date,
    workout_plan: workout_plan ?? null,
    meal_plan: meal_plan ?? null,
    notes: notes ?? null,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  return { ok: true };
}

const ToggleWorkoutPauseInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paused: z.boolean(),
});

const PendingActionInput = z.object({ id: z.string().uuid() });

export async function approvePendingPlan(input: z.infer<typeof PendingActionInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = PendingActionInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_request");
  const result = await approvePendingPlanQuery(
    parsed.data.id,
    session.userId as UserId,
  );
  if (!result.ok) throw new Error(result.reason);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  return { ok: true, applied: result.count };
}

export async function rejectPendingPlan(input: z.infer<typeof PendingActionInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = PendingActionInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_request");
  const row = await rejectPendingPlanQuery(
    parsed.data.id,
    session.userId as UserId,
  );
  if (!row) throw new Error("not_found");
  revalidatePath("/dashboard/plan");
  return { ok: true };
}

const TogglePlanItemDoneInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  kind: z.enum(["workout", "meal"]),
  index: z.number().int().nonnegative().max(40),
  done: z.boolean(),
});

export async function togglePlanItemDoneAction(
  input: z.infer<typeof TogglePlanItemDoneInput>,
) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = TogglePlanItemDoneInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  await togglePlanItemDone({
    user_id: session.userId as UserId,
    ...parsed.data,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  return { ok: true };
}

const DeletePlanInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// Wipes today's (or any date's) plan entirely. Used when the user wants to
// re-plan from scratch — deletes the daily_plans row for that date,
// taking workout_plan, meal_plan, notes, and completion with it.
// Approved plans (in pending_plans) are kept as-is; if you re-Apply them
// later they'll re-create the row.
export async function deletePlanForDate(input: z.infer<typeof DeletePlanInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = DeletePlanInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  const userId = session.userId as UserId;
  const r = await db
    .delete(schema.daily_plans)
    .where(
      and(
        eq(schema.daily_plans.user_id, userId),
        eq(schema.daily_plans.date, parsed.data.date),
      ),
    )
    .returning({ id: schema.daily_plans.id });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  return { ok: true, deleted: r.length > 0 };
}

export async function toggleWorkoutPause(
  input: z.infer<typeof ToggleWorkoutPauseInput>,
) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = ToggleWorkoutPauseInput.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await setWorkoutPaused(
    session.userId as UserId,
    parsed.data.date,
    parsed.data.paused,
  );
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  return { ok: true, paused: parsed.data.paused };
}
