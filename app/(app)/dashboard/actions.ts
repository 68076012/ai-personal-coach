"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db, schema } from "@/lib/db/client";
import { getSession } from "@/lib/auth";
import {
  bumpMealLibraryUsage,
  deleteMealById,
  deleteWorkoutById,
  insertMeal,
  updateUser,
  upsertDailyLog,
} from "@/lib/db/queries";
import { formatInTimeZone } from "date-fns-tz";
import type { Meal, MealType, UserId, Workout } from "@/lib/db/schema";

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

// Quick-log weight from the dashboard. Upserts daily_logs by (user_id,
// date) so re-weighing later in the same day overwrites the morning's
// reading. Also bumps users.current_weight_kg so prompts/header reflect
// the latest reading without waiting for the next morning report.
const QuickLogWeightInput = z.object({
  weight_kg: z.number().positive().max(400),
});

export async function quickLogWeight(input: z.infer<typeof QuickLogWeightInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = QuickLogWeightInput.safeParse(input);
  if (!parsed.success) throw new Error("invalid_weight");
  const userId = session.userId as UserId;
  const today = formatInTimeZone(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  await upsertDailyLog({
    user_id: userId,
    date: today,
    weight_kg: parsed.data.weight_kg,
  });
  await updateUser(userId, { current_weight_kg: parsed.data.weight_kg });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/progress");
  revalidatePath("/dashboard/couple");
  return { ok: true, weight_kg: parsed.data.weight_kg };
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
  // Return the deleted row so the client can offer a 5s undo toast that
  // restores it without re-fetching from the network.
  return { ok: true, row };
}

const RestoreInput = z.object({
  table: z.enum(["meals", "workouts"]),
  // Pass-through of the row deleteLogEntry returned. Trusted shape since
  // this is one round-trip from the same client; the server still gates on
  // session userId so a hijacked row from another user can't sneak in.
  row: z.record(z.string(), z.unknown()),
});

export async function restoreLogEntry(input: z.infer<typeof RestoreInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = RestoreInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  const userId = session.userId as UserId;
  const row = parsed.data.row as Record<string, unknown>;

  // Coerce string datetimes back to Date — JSON round-trip strips them.
  const datetime = row.datetime instanceof Date
    ? row.datetime
    : typeof row.datetime === "string"
      ? new Date(row.datetime)
      : new Date();

  if (parsed.data.table === "meals") {
    const m = row as unknown as Meal;
    await db.insert(schema.meals).values({
      id: typeof m.id === "string" ? m.id : undefined,
      user_id: userId,
      datetime,
      meal_type: m.meal_type,
      food_name: m.food_name,
      kcal: m.kcal,
      protein_g: m.protein_g,
      carb_g: m.carb_g,
      fat_g: m.fat_g,
      confidence: m.confidence,
      notes: m.notes,
    });
  } else {
    const w = row as unknown as Workout;
    await db.insert(schema.workouts).values({
      id: typeof w.id === "string" ? w.id : undefined,
      user_id: userId,
      datetime,
      exercise: w.exercise,
      sets: w.sets,
      reps: w.reps,
      weight_kg: w.weight_kg,
      duration_min: w.duration_min,
      rpe: w.rpe,
      notes: w.notes,
    });
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/progress");
  return { ok: true };
}
