import { z } from "zod";

export const MealTypeSchema = z.enum(["breakfast", "lunch", "dinner", "snack"]);
export type MealType = z.infer<typeof MealTypeSchema>;

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "เช้า",
  lunch: "กลางวัน",
  dinner: "เย็น",
  snack: "ของว่าง",
};

export const WorkoutItemSchema = z.object({
  exercise: z.string().min(1).max(200),
  sets: z.number().int().nonnegative().max(50).nullable().optional(),
  reps: z.number().int().nonnegative().max(500).nullable().optional(),
  weight_kg: z.number().nonnegative().max(1000).nullable().optional(),
  duration_min: z.number().nonnegative().max(600).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type WorkoutItem = z.infer<typeof WorkoutItemSchema>;

export const MealItemSchema = z.object({
  meal_type: MealTypeSchema,
  name: z.string().min(1).max(200),
  kcal: z.number().nonnegative().max(20000).nullable().optional(),
  protein_g: z.number().nonnegative().max(2000).nullable().optional(),
  carb_g: z.number().nonnegative().max(2000).nullable().optional(),
  fat_g: z.number().nonnegative().max(2000).nullable().optional(),
  prep_min: z.number().nonnegative().max(600).nullable().optional(),
  ingredients: z.array(z.string()).max(50).nullable().optional(),
});
export type MealItem = z.infer<typeof MealItemSchema>;

export const PlanSchema = z.object({
  workout_plan: z.array(WorkoutItemSchema).max(40).nullable().optional(),
  meal_plan: z.array(MealItemSchema).max(20).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});
export type Plan = z.infer<typeof PlanSchema>;

export function emptyWorkoutItem(): WorkoutItem {
  return { exercise: "" };
}

export function emptyMealItem(meal_type: MealType = "breakfast"): MealItem {
  return { meal_type, name: "" };
}

export function asWorkoutArray(value: unknown): WorkoutItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => WorkoutItemSchema.safeParse(v))
    .filter((r) => r.success)
    .map((r) => r.data);
}

export function asMealArray(value: unknown): MealItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => MealItemSchema.safeParse(v))
    .filter((r) => r.success)
    .map((r) => r.data);
}
