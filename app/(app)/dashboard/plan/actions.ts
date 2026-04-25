"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { setWorkoutPaused, upsertDailyPlan } from "@/lib/db/queries";
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
