"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { bumpMealLibraryUsage, insertMeal } from "@/lib/db/queries";
import { db, schema } from "@/lib/db/client";
import { and, eq, sql } from "drizzle-orm";
import type { UserId, MealType } from "@/lib/db/schema";

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

  const [entry] = await db
    .select()
    .from(schema.meal_library)
    .where(
      and(
        eq(schema.meal_library.user_id, userId),
        sql`lower(${schema.meal_library.name}) = lower(${parsed.data.name})`,
      ),
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
