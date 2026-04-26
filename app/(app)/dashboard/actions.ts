"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  bumpMealLibraryUsage,
  deleteMealById,
  deleteWorkoutById,
  insertMeal,
} from "@/lib/db/queries";
import type { MealType, UserId } from "@/lib/db/schema";

const DeleteEntryInput = z.object({
  table: z.enum(["meals", "workouts"]),
  id: z.string().uuid(),
});

// Quick-log form on the dashboard. Bypasses the chat → orchestrator →
// nutritionist → log_meal path when the user already knows the macros
// (e.g. "another bowl of the usual pad ka prao"). Falls back to chat
// for unknown foods via the "Ask coach instead" link inside the sheet.
const QuickLogMealInput = z.object({
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  food_name: z.string().min(1).max(200),
  kcal: z.number().int().nonnegative().max(20000),
  protein_g: z.number().nonnegative().max(2000),
  carb_g: z.number().nonnegative().max(2000),
  fat_g: z.number().nonnegative().max(2000),
});

export async function quickLogMeal(input: z.infer<typeof QuickLogMealInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = QuickLogMealInput.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const userId = session.userId as UserId;
  const row = await insertMeal({
    user_id: userId,
    datetime: new Date(),
    meal_type: parsed.data.meal_type as MealType,
    food_name: parsed.data.food_name,
    kcal: parsed.data.kcal,
    protein_g: parsed.data.protein_g,
    carb_g: parsed.data.carb_g,
    fat_g: parsed.data.fat_g,
    confidence: 1,
    notes: "quick log",
  });
  // Self-organize meal library, same as the log_meal tool path.
  bumpMealLibraryUsage(userId, parsed.data.food_name).catch(() => {});
  revalidatePath("/dashboard");
  return { ok: true, id: row.id, kcal: row.kcal };
}

// User-driven delete from the dashboard "Recent" list. Same write path
// the LLM uses via delete_log_entry, but addressable from a UI X button
// without going through chat.
export async function deleteLogEntry(input: z.infer<typeof DeleteEntryInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = DeleteEntryInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  const userId = session.userId as UserId;
  const row =
    parsed.data.table === "meals"
      ? await deleteMealById(userId, parsed.data.id)
      : await deleteWorkoutById(userId, parsed.data.id);
  if (!row) throw new Error("not_found");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/progress");
  return { ok: true };
}
