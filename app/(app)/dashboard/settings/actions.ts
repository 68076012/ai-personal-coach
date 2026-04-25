"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { updateUser } from "@/lib/db/queries";
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
