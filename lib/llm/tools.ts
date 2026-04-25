import { Type, type FunctionDeclaration } from "@google/genai";
import { z } from "zod";
import {
  appendConversation,
  getMealsSince,
  getRecentDailyLogs,
  getDailyPlan,
  getWorkoutsSince,
  insertMeal,
  insertWorkout,
  upsertAgentMemory,
  upsertDailyPlan,
} from "@/lib/db/queries";
import type { AgentType, MealType, UserId } from "@/lib/db/schema";

// ===== Schemas =====

const Iso = z.string().min(1);

const LogMealArgs = z.object({
  datetime: Iso.optional(),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
  food_name: z.string().min(1),
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carb_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional(),
});

const LogWorkoutArgs = z.object({
  datetime: Iso.optional(),
  exercise: z.string().min(1),
  sets: z.number().int().nonnegative().optional(),
  reps: z.number().int().nonnegative().optional(),
  weight_kg: z.number().nonnegative().optional(),
  duration_min: z.number().nonnegative().optional(),
  rpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().optional(),
});

const UpdatePlanArgs = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  workout_plan: z.unknown().optional(),
  meal_plan: z.unknown().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
});

const UpdateMemoryArgs = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  scope: z.enum(["trainer", "nutritionist", "meal_designer", "shared"]).default("shared"),
  ttl_days: z.number().int().positive().optional(),
});

const GetHistoryArgs = z.object({
  type: z.enum(["meals", "workouts", "weight"]),
  days: z.number().int().positive().max(120).default(7),
});

const GetPlanArgs = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const ProposeMealsArgs = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  meals: z.array(
    z.object({
      meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      name: z.string(),
      kcal: z.number().nonnegative(),
      protein_g: z.number().nonnegative(),
      carb_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
      prep_min: z.number().nonnegative().optional(),
      ingredients: z.array(z.string()).optional(),
    }),
  ),
});

// ===== Function declarations (sent to Gemini) =====

export const TOOL_DECLARATIONS: Record<string, FunctionDeclaration> = {
  log_meal: {
    name: "log_meal",
    description:
      "บันทึกมื้ออาหารที่ผู้ใช้กิน พร้อมประมาณ macros (kcal/protein/carb/fat). ถ้าไม่แน่ใจเรื่องปริมาณให้ส่ง confidence < 0.7",
    parameters: {
      type: Type.OBJECT,
      properties: {
        datetime: { type: Type.STRING, description: "ISO 8601, default = now" },
        meal_type: {
          type: Type.STRING,
          enum: ["breakfast", "lunch", "dinner", "snack"],
        },
        food_name: { type: Type.STRING },
        kcal: { type: Type.NUMBER },
        protein_g: { type: Type.NUMBER },
        carb_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
        confidence: { type: Type.NUMBER, description: "0..1" },
        notes: { type: Type.STRING },
      },
      required: ["meal_type", "food_name", "kcal", "protein_g", "carb_g", "fat_g"],
    },
  },
  log_workout: {
    name: "log_workout",
    description: "บันทึกการออกกำลังกาย",
    parameters: {
      type: Type.OBJECT,
      properties: {
        datetime: { type: Type.STRING, description: "ISO 8601, default = now" },
        exercise: { type: Type.STRING },
        sets: { type: Type.INTEGER },
        reps: { type: Type.INTEGER },
        weight_kg: { type: Type.NUMBER },
        duration_min: { type: Type.NUMBER },
        rpe: { type: Type.INTEGER, description: "1-10" },
        notes: { type: Type.STRING },
      },
      required: ["exercise"],
    },
  },
  update_plan: {
    name: "update_plan",
    description:
      "เพิ่มหรืออัพเดทแผนของวันที่ระบุ (workout_plan และ/หรือ meal_plan). ใช้เมื่อผู้ใช้ขอเปลี่ยนแผน",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING, description: "YYYY-MM-DD" },
        workout_plan: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              exercise: { type: Type.STRING },
              sets: { type: Type.INTEGER },
              reps: { type: Type.INTEGER },
              weight_kg: { type: Type.NUMBER },
              duration_min: { type: Type.NUMBER },
              notes: { type: Type.STRING },
            },
            required: ["exercise"],
          },
        },
        meal_plan: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              meal_type: {
                type: Type.STRING,
                enum: ["breakfast", "lunch", "dinner", "snack"],
              },
              name: { type: Type.STRING },
              kcal: { type: Type.NUMBER },
              protein_g: { type: Type.NUMBER },
              carb_g: { type: Type.NUMBER },
              fat_g: { type: Type.NUMBER },
            },
            required: ["meal_type", "name"],
          },
        },
        notes: { type: Type.STRING },
        reason: { type: Type.STRING, description: "ทำไมต้องอัพเดท (เก็บใน memory)" },
      },
      required: ["date"],
    },
  },
  update_memory: {
    name: "update_memory",
    description:
      "บันทึกความจำระยะยาวเกี่ยวกับผู้ใช้ เช่นบาดเจ็บ ความชอบ ข้อจำกัดเวลา",
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: "snake_case key" },
        value: { type: Type.STRING },
        scope: {
          type: Type.STRING,
          enum: ["trainer", "nutritionist", "meal_designer", "shared"],
        },
        ttl_days: { type: Type.INTEGER },
      },
      required: ["key", "value"],
    },
  },
  get_history: {
    name: "get_history",
    description: "ดึงประวัติ meals/workouts/weight ของผู้ใช้",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["meals", "workouts", "weight"] },
        days: { type: Type.INTEGER, description: "default 7, max 120" },
      },
      required: ["type"],
    },
  },
  get_plan: {
    name: "get_plan",
    description: "ดึงแผนของวันที่ระบุ",
    parameters: {
      type: Type.OBJECT,
      properties: { date: { type: Type.STRING } },
      required: ["date"],
    },
  },
  propose_meals: {
    name: "propose_meals",
    description: "เสนอเมนูสำหรับวัน (สำหรับ Meal Designer agent)",
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: { type: Type.STRING },
        meals: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              meal_type: {
                type: Type.STRING,
                enum: ["breakfast", "lunch", "dinner", "snack"],
              },
              name: { type: Type.STRING },
              kcal: { type: Type.NUMBER },
              protein_g: { type: Type.NUMBER },
              carb_g: { type: Type.NUMBER },
              fat_g: { type: Type.NUMBER },
              prep_min: { type: Type.NUMBER },
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["meal_type", "name", "kcal", "protein_g", "carb_g", "fat_g"],
          },
        },
      },
      required: ["date", "meals"],
    },
  },
};

export type ToolName = keyof typeof TOOL_DECLARATIONS;

export function declarationsForAgent(
  agent: "trainer" | "nutritionist" | "meal_designer" | "reporter" | "orchestrator",
): FunctionDeclaration[] {
  switch (agent) {
    case "trainer":
      return [
        TOOL_DECLARATIONS.log_workout,
        TOOL_DECLARATIONS.update_plan,
        TOOL_DECLARATIONS.update_memory,
        TOOL_DECLARATIONS.get_history,
        TOOL_DECLARATIONS.get_plan,
      ];
    case "nutritionist":
      return [
        TOOL_DECLARATIONS.log_meal,
        TOOL_DECLARATIONS.update_memory,
        TOOL_DECLARATIONS.get_history,
      ];
    case "meal_designer":
      return [
        TOOL_DECLARATIONS.propose_meals,
        TOOL_DECLARATIONS.update_plan,
        TOOL_DECLARATIONS.update_memory,
      ];
    case "reporter":
      return [TOOL_DECLARATIONS.get_history, TOOL_DECLARATIONS.get_plan];
    case "orchestrator":
      return [];
  }
}

// ===== Handlers =====

export interface ToolContext {
  userId: UserId;
  now: Date;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    switch (name) {
      case "log_meal": {
        const a = LogMealArgs.parse(args);
        const row = await insertMeal({
          user_id: ctx.userId,
          datetime: a.datetime ? new Date(a.datetime) : ctx.now,
          meal_type: a.meal_type,
          food_name: a.food_name,
          kcal: Math.round(a.kcal),
          protein_g: a.protein_g,
          carb_g: a.carb_g,
          fat_g: a.fat_g,
          confidence: a.confidence ?? null,
          notes: a.notes ?? null,
        });
        return { ok: true, data: { id: row.id, kcal: row.kcal } };
      }
      case "log_workout": {
        const a = LogWorkoutArgs.parse(args);
        const row = await insertWorkout({
          user_id: ctx.userId,
          datetime: a.datetime ? new Date(a.datetime) : ctx.now,
          exercise: a.exercise,
          sets: a.sets ?? null,
          reps: a.reps ?? null,
          weight_kg: a.weight_kg ?? null,
          duration_min: a.duration_min ?? null,
          rpe: a.rpe ?? null,
          notes: a.notes ?? null,
        });
        return { ok: true, data: { id: row.id } };
      }
      case "update_plan": {
        const a = UpdatePlanArgs.parse(args);
        const row = await upsertDailyPlan({
          user_id: ctx.userId,
          date: a.date,
          workout_plan: a.workout_plan ?? null,
          meal_plan: a.meal_plan ?? null,
          notes: a.notes ?? null,
        });
        if (a.reason) {
          await upsertAgentMemory({
            user_id: ctx.userId,
            agent_type: "shared",
            key: `plan_change_${a.date}`,
            value: a.reason,
            expires_at: addDays(ctx.now, 14),
          });
        }
        return { ok: true, data: { id: row.id, date: row.date } };
      }
      case "update_memory": {
        const a = UpdateMemoryArgs.parse(args);
        const row = await upsertAgentMemory({
          user_id: ctx.userId,
          agent_type: a.scope as AgentType,
          key: a.key,
          value: a.value,
          expires_at: a.ttl_days ? addDays(ctx.now, a.ttl_days) : null,
        });
        return { ok: true, data: { key: row.key } };
      }
      case "get_history": {
        const a = GetHistoryArgs.parse(args);
        const since = addDays(ctx.now, -a.days);
        if (a.type === "meals") {
          const rows = await getMealsSince(ctx.userId, since);
          return { ok: true, data: rows.slice(0, 50) };
        }
        if (a.type === "workouts") {
          const rows = await getWorkoutsSince(ctx.userId, since);
          return { ok: true, data: rows.slice(0, 50) };
        }
        const rows = await getRecentDailyLogs(ctx.userId, a.days);
        return {
          ok: true,
          data: rows
            .filter((r) => r.weight_kg !== null)
            .map((r) => ({ date: r.date, weight_kg: r.weight_kg })),
        };
      }
      case "get_plan": {
        const a = GetPlanArgs.parse(args);
        const row = await getDailyPlan(ctx.userId, a.date);
        return { ok: true, data: row };
      }
      case "propose_meals": {
        const a = ProposeMealsArgs.parse(args);
        const row = await upsertDailyPlan({
          user_id: ctx.userId,
          date: a.date,
          meal_plan: a.meals as unknown,
        });
        return { ok: true, data: { id: row.id, count: a.meals.length } };
      }
      default:
        return { ok: false, error: `unknown_tool:${name}` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export type { MealType };

export async function logTurn(
  userId: UserId,
  agentType: AgentType,
  role: "user" | "assistant" | "tool",
  content: string,
  toolCalls?: unknown,
) {
  await appendConversation({
    user_id: userId,
    agent_type: agentType,
    role,
    content,
    tool_calls: toolCalls ?? null,
  });
}
