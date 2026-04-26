"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { resetUserData, updateUser } from "@/lib/db/queries";
import type { UserId } from "@/lib/db/schema";

const GoalInput = z.object({
  goal: z.string().min(1).max(500),
  goal_kcal: z.number().int().positive().max(10000).nullable(),
  goal_protein_g: z.number().int().nonnegative().max(500).nullable(),
  goal_carb_g: z.number().int().nonnegative().max(1000).nullable(),
  goal_fat_g: z.number().int().nonnegative().max(500).nullable(),
  activity_level: z.enum(["sedentary", "light", "moderate", "active"]).nullable(),
  current_weight_kg: z.number().positive().max(400).nullable(),
  age: z.number().int().positive().max(120),
  height_cm: z.number().positive().max(250),
  work_hours: z.string().max(300).nullable(),
  workout_window: z.string().max(300).nullable(),
  budget_per_day_thb: z.number().int().nonnegative().max(100000).nullable(),
  pantry_ingredients: z.string().max(2000).nullable(),
  dietary_notes: z.string().max(1000).nullable(),
  sports_focus: z.string().max(120).nullable(),
});

export type GoalFormValues = z.infer<typeof GoalInput>;

export async function updateGoal(input: GoalFormValues) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = GoalInput.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await updateUser(session.userId as UserId, parsed.data);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/chat");
  revalidatePath("/dashboard/settings");
  return { ok: true };
}

const ResetAccountInput = z.object({
  // Anti-fat-finger: caller passes the typed-in confirmation phrase.
  // Server requires it to equal the literal "RESET" so a stray click
  // can't fire the action.
  confirmation: z.literal("RESET"),
});

export async function resetAccount(input: z.infer<typeof ResetAccountInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = ResetAccountInput.safeParse(input);
  if (!parsed.success) throw new Error("confirmation_required");
  const counts = await resetUserData(session.userId as UserId);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/chat");
  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard/progress");
  revalidatePath("/dashboard/settings");
  return { ok: true, deleted: counts };
}
