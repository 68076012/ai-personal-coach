"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { formatInTimeZone } from "date-fns-tz";
import { getSession } from "@/lib/auth";
import {
  bumpMealLibraryUsage,
  getDailyPlan,
  insertMeal,
  upsertDailyPlan,
} from "@/lib/db/queries";
import { db, schema } from "@/lib/db/client";
import { sql } from "drizzle-orm";
import { asMealArray, type MealItem } from "@/lib/plan-types";
import type { UserId, MealType } from "@/lib/db/schema";

const TZ = "Asia/Bangkok";

const UseMealInput = z.object({
  name: z.string().min(1),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

// Pulls the named entry from the user's meal_library, inserts a meals row
// for "now", and bumps the library usage counter so it floats up in
// find_saved_meal results next time the agent looks.
export async function useSavedMeal(input: z.infer<typeof UseMealInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = UseMealInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  const userId = session.userId as UserId;

  // Library is shared across users — look up by name only, regardless of
  // which user originally saved the entry.
  const [entry] = await db
    .select()
    .from(schema.meal_library)
    .where(
      sql`lower(${schema.meal_library.name}) = lower(${parsed.data.name})`,
    )
    .limit(1);
  if (!entry) throw new Error("meal_not_in_library");

  await insertMeal({
    user_id: userId,
    datetime: new Date(),
    meal_type: (parsed.data.meal_type ?? entry.meal_type ?? "snack") as MealType,
    food_name: entry.name,
    kcal: entry.kcal,
    protein_g: entry.protein_g,
    carb_g: entry.carb_g,
    fat_g: entry.fat_g,
    confidence: 1,
    notes: "from meal library",
  });
  await bumpMealLibraryUsage(userId, entry.name);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/library");
  return { ok: true, kcal: entry.kcal };
}

const AddToPlanInput = z.object({
  name: z.string().min(1),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
});

// Adds a saved meal to today's daily_plans.meal_plan as a planned entry —
// distinct from useSavedMeal which inserts an actual meals row (i.e., logs
// it as eaten). Used by the library list's "+ แผน" / "+ Plan" button so the
// user can stage their meal queue without committing macros yet.
export async function addToTodayPlan(input: z.infer<typeof AddToPlanInput>) {
  const session = await getSession();
  if (!session.userId) throw new Error("unauthenticated");
  const parsed = AddToPlanInput.safeParse(input);
  if (!parsed.success) throw new Error("bad_input");
  const userId = session.userId as UserId;

  const [entry] = await db
    .select()
    .from(schema.meal_library)
    .where(
      sql`lower(${schema.meal_library.name}) = lower(${parsed.data.name})`,
    )
    .limit(1);
  if (!entry) throw new Error("meal_not_in_library");

  const today = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  const existing = await getDailyPlan(userId, today);
  const currentMeals = asMealArray(existing?.meal_plan);
  const newMeal: MealItem = {
    meal_type: (parsed.data.meal_type ?? entry.meal_type ?? "snack") as MealType,
    name: entry.name,
    kcal: entry.kcal,
    protein_g: entry.protein_g,
    carb_g: entry.carb_g,
    fat_g: entry.fat_g,
    prep_min: entry.prep_min ?? null,
    ingredients: (entry.ingredients as string[] | null) ?? null,
  };
  const nextMeals = [...currentMeals, newMeal];

  await upsertDailyPlan({
    user_id: userId,
    date: today,
    workout_plan: existing?.workout_plan ?? null,
    meal_plan: nextMeals,
    notes: existing?.notes ?? null,
  });
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/plan");
  revalidatePath("/dashboard/library");
  return { ok: true, count: nextMeals.length };
}
