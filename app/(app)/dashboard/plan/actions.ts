"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { upsertDailyPlan } from "@/lib/db/queries";
import type { UserId } from "@/lib/db/schema";

const PlanInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workout_plan: z.unknown().optional(),
  meal_plan: z.unknown().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function savePlan(input: z.infer<typeof PlanInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = PlanInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  await upsertDailyPlan({
    user_id: session.userId as UserId,
    date: parsed.data.date,
    workout_plan: parsed.data.workout_plan ?? null,
    meal_plan: parsed.data.meal_plan ?? null,
    notes: parsed.data.notes ?? null,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  return { ok: true };
}
