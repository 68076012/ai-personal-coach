import { Type, type FunctionDeclaration } from "./types";
import { z } from "zod";
import {
  appendConversation,
  bumpMealLibraryUsage,
  deleteMealById,
  deleteWorkoutById,
  findMealLibraryByName,
  getDailyMacroSummary,
  getDailyPlan,
  getMealsSince,
  getRecentDailyLogs,
  getUser,
  getWeightSeries,
  getWorkoutDailyVolume,
  getWorkoutSummary,
  getWorkoutsSince,
  insertMeal,
  insertPendingPlan,
  insertWorkout,
  listMealLibrary,
  searchAgentMemory,
  updateUser,
  upsertAgentMemory,
  upsertDailyPlan,
  upsertMealLibraryEntry,
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

const GetHistorySummaryArgs = z.object({
  type: z.enum(["macros", "workouts", "weight"]),
  days: z.number().int().positive().max(120).default(14),
});

const SearchMemoryArgs = z.object({
  query: z.string().min(1).max(120),
  limit: z.number().int().positive().max(20).default(8),
});

const DeleteLogEntryArgs = z.object({
  table: z.enum(["meals", "workouts"]),
  id: z.string().uuid(),
});

const SaveMealArgs = z.object({
  name: z.string().min(1).max(200),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack"]).optional(),
  kcal: z.number().nonnegative(),
  protein_g: z.number().nonnegative(),
  carb_g: z.number().nonnegative(),
  fat_g: z.number().nonnegative(),
  prep_min: z.number().int().nonnegative().max(600).optional(),
  ingredients: z.array(z.string()).max(50).optional(),
  recipe: z.string().max(4000).optional(),
  notes: z.string().max(500).optional(),
});

const FindSavedMealArgs = z.object({
  query: z.string().max(120).optional(),
  limit: z.number().int().positive().max(20).default(10),
});

// Whitelist — values must match users column names. Order grouped by edit-risk.
const PROFILE_FIELDS = [
  // Additive — agent may write directly without confirming in chat first
  "pantry_ingredients",
  "dietary_notes",
  "sports_focus",
  "work_hours",
  "workout_window",
  "budget_per_day_thb",
  // Destructive — agent MUST restate change in chat and get user 'ใช่/ok' first
  "goal",
  "goal_kcal",
  "goal_protein_g",
  "goal_carb_g",
  "goal_fat_g",
  "current_weight_kg",
  "age",
  "height_cm",
  "activity_level",
] as const;
type ProfileField = (typeof PROFILE_FIELDS)[number];

const NULLABLE_FIELDS = new Set<ProfileField>([
  "pantry_ingredients",
  "dietary_notes",
  "sports_focus",
  "work_hours",
  "workout_window",
  "budget_per_day_thb",
  "goal_kcal",
  "goal_protein_g",
  "goal_carb_g",
  "goal_fat_g",
  "current_weight_kg",
]);

const UpdateProfileArgs = z.object({
  field: z.enum(PROFILE_FIELDS),
  value: z.string(), // stringified — coerced per-field below
  reason: z.string().max(300).optional(),
});

interface ParsedValue {
  ok: true;
  value: string | number | null;
}
interface ParseError {
  ok: false;
  error: string;
}

function parseProfileValue(field: ProfileField, raw: string): ParsedValue | ParseError {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed.toLowerCase() === "null") {
    if (NULLABLE_FIELDS.has(field)) return { ok: true, value: null };
    return { ok: false, error: `${field} ห้ามเป็นค่าว่าง` };
  }

  const stringMaxes: Partial<Record<ProfileField, number>> = {
    goal: 500,
    pantry_ingredients: 2000,
    dietary_notes: 1000,
    sports_focus: 120,
    work_hours: 300,
    workout_window: 300,
  };

  const intFields: Partial<Record<ProfileField, number>> = {
    goal_kcal: 10000,
    goal_protein_g: 500,
    goal_carb_g: 1000,
    goal_fat_g: 500,
    age: 120,
    budget_per_day_thb: 100000,
  };

  const floatFields: Partial<Record<ProfileField, number>> = {
    current_weight_kg: 400,
    height_cm: 250,
  };

  if (field in stringMaxes) {
    const max = stringMaxes[field]!;
    if (trimmed.length > max) return { ok: false, error: `ยาวเกิน ${max} ตัวอักษร` };
    return { ok: true, value: trimmed };
  }

  if (field in intFields) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
      return { ok: false, error: "ต้องเป็นจำนวนเต็มไม่ติดลบ" };
    }
    if (n > intFields[field]!) {
      return { ok: false, error: `เกินค่าสูงสุด ${intFields[field]}` };
    }
    return { ok: true, value: n };
  }

  if (field in floatFields) {
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "ต้องเป็นจำนวนบวก" };
    if (n > floatFields[field]!) {
      return { ok: false, error: `เกินค่าสูงสุด ${floatFields[field]}` };
    }
    return { ok: true, value: n };
  }

  if (field === "activity_level") {
    if (!["sedentary", "light", "moderate", "active"].includes(trimmed)) {
      return { ok: false, error: "ต้องเป็น sedentary | light | moderate | active" };
    }
    return { ok: true, value: trimmed };
  }

  return { ok: false, error: `unknown field: ${field}` };
}

const ProposePlanBulkArgs = z.object({
  reason: z.string().max(300).optional(),
  plans: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        workout_plan: z.unknown().optional(),
        meal_plan: z.unknown().optional(),
        notes: z.string().optional(),
      }),
    )
    .min(1)
    .max(31),
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

// ===== Function declarations (sent to the LLM) =====

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
    description: "ดึงประวัติ meals/workouts/weight ของผู้ใช้ (raw rows). ใช้เมื่อต้องดูรายละเอียดแต่ละรายการ — ถ้าอยากได้ภาพรวม ใช้ get_history_summary แทน",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["meals", "workouts", "weight"] },
        days: { type: Type.INTEGER, description: "default 7, max 120" },
      },
      required: ["type"],
    },
  },
  get_history_summary: {
    name: "get_history_summary",
    description:
      "ดึงสรุปสถิติย้อนหลัง (pre-aggregated): macros = kcal/protein/carb/fat ต่อวัน + ค่าเฉลี่ย, workouts = per-exercise sessions/sets/volume/max_weight + daily volume, weight = trend (latest, delta 7d/30d). ใช้แทน get_history เมื่อต้องการ insight เช่น 'อาทิตย์นี้กินเฉลี่ยกี่ kcal' หรือ 'squat ทำหนักสุดเท่าไหร่ใน 30 วัน'",
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, enum: ["macros", "workouts", "weight"] },
        days: { type: Type.INTEGER, description: "default 14, max 120" },
      },
      required: ["type"],
    },
  },
  update_profile: {
    name: "update_profile",
    description:
      "อัพเดท profile field ของผู้ใช้ (ตาราง users). ใช้เมื่อ user บอกในแชทว่าข้อมูลตัวเองเปลี่ยน เช่น 'ตอนนี้น้ำหนัก 70', 'แพ้นมเพิ่ม', 'งบลดเหลือ 200', 'อยากกินโปรตีน 150g/วัน'. ส่ง value เป็น string เสมอ (ตัวเลขก็ stringify เช่น '70', '150') — system จะแปลงให้ตามชนิด field. ถ้าจะ clear field nullable ให้ส่ง value=''. " +
      "สำคัญ — รู้จัก 2 ชนิด field:\n" +
      "(A) ADDITIVE — เขียนได้ทันทีไม่ต้องถาม: pantry_ingredients, dietary_notes, sports_focus, work_hours, workout_window, budget_per_day_thb\n" +
      "(B) DESTRUCTIVE — ก่อนเรียก ให้ restate ใน chat ('จะอัพเดท X จาก A → B ใช่มั้ย?') แล้วรอ user ตอบ ใช่/ok ก่อน: goal, goal_kcal, goal_protein_g, goal_carb_g, goal_fat_g, current_weight_kg, age, height_cm, activity_level\n" +
      "หลังเขียนเสร็จ ตอบ user สั้นๆ ว่าอัพเดทแล้ว (เช่น 'อัพเดท dietary_notes แล้ว — ครั้งหน้าผมจะหลีกเลี่ยงนม')",
    parameters: {
      type: Type.OBJECT,
      properties: {
        field: {
          type: Type.STRING,
          enum: PROFILE_FIELDS as unknown as string[],
        },
        value: {
          type: Type.STRING,
          description:
            "ค่าใหม่ stringified. ตัวเลขเขียนเป็น string เช่น '70'. ถ้าจะ clear field ส่ง '' (เฉพาะ field nullable)",
        },
        reason: {
          type: Type.STRING,
          description: "ทำไมเปลี่ยน (เก็บ audit ใน agent_memory)",
        },
      },
      required: ["field", "value"],
    },
  },
  delete_log_entry: {
    name: "delete_log_entry",
    description:
      "ลบ entry ใน meals หรือ workouts ตาม id. ใช้เมื่อ user บอกว่าบันทึกผิด เช่น 'ลบมื้อเที่ยงเมื่อกี้ บันทึกซ้ำ' หรือ 'ลบ squat ที่บันทึกผิด'. " +
      "ขั้นตอน: เรียก get_history เพื่อหา id ก่อนเสมอ — entry ใหม่ๆ อยู่บนสุด. ถ้า user บอกชัดๆ ว่าอันไหน ให้เลือกตามที่บอก. ถ้าไม่ชัด ให้ถามก่อนลบ — undo ไม่ได้.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        table: { type: Type.STRING, enum: ["meals", "workouts"] },
        id: { type: Type.STRING, description: "uuid ของ row" },
      },
      required: ["table", "id"],
    },
  },
  search_memory: {
    name: "search_memory",
    description:
      "ค้นหา agent_memory ด้วย keyword (case-insensitive substring match บน key+value). ใช้เพื่อเช็คว่าผู้ใช้เคยพูดถึงอะไรไว้ก่อนหน้า เช่น ค้น 'เข่า' → จะได้บันทึกเรื่องอาการเข่าทั้งหมด, 'แพ้' → ของแพ้, 'งบ' → constraint งบประมาณ",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "keyword ภาษาไทย/อังกฤษ" },
        limit: { type: Type.INTEGER, description: "default 8, max 20" },
      },
      required: ["query"],
    },
  },
  save_meal: {
    name: "save_meal",
    description:
      "บันทึกเมนูเข้า meal library ของผู้ใช้ (re-usable favorite). เรียกหลังผู้ใช้บอกว่าชอบเมนูนี้ หรือเมื่อ propose_meals เสนอเมนูใหม่ที่ดีพอจะเก็บไว้. ถ้าเมนูชื่อเดิมมีอยู่แล้ว → จะ update macros ทับ. **เก็บ ingredients (วัตถุดิบ) และ recipe (วิธีทำ) เสมอเมื่อมีข้อมูล** — UI ของ library โชว์ทั้งสองอย่างเป็น expand panel ให้ user ดูตอนตัดสินใจว่าจะกินอะไร",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        meal_type: {
          type: Type.STRING,
          enum: ["breakfast", "lunch", "dinner", "snack"],
        },
        kcal: { type: Type.NUMBER },
        protein_g: { type: Type.NUMBER },
        carb_g: { type: Type.NUMBER },
        fat_g: { type: Type.NUMBER },
        prep_min: { type: Type.INTEGER },
        ingredients: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "รายการวัตถุดิบ พร้อมปริมาณ เช่น ['ไก่อก 150g', 'ข้าวกล้อง 1 ทัพพี']",
        },
        recipe: {
          type: Type.STRING,
          description:
            "วิธีทำ markdown ได้ — ขั้นตอนการปรุง 3-6 ขั้น กระชับ. เก็บเสมอถ้า user หรือ agent คิดเมนูใหม่ขึ้นมา; library UI จะแสดงในปุ่ม expand",
        },
        notes: { type: Type.STRING },
      },
      required: ["name", "kcal", "protein_g", "carb_g", "fat_g"],
    },
  },
  find_saved_meal: {
    name: "find_saved_meal",
    description:
      "ดู meal library ของผู้ใช้. ถ้าใส่ query → ค้นด้วย substring บนชื่อ/notes. ถ้าไม่ใส่ → คืน top recent/most-used. ใช้ก่อนเสนอเมนูใหม่เพื่อ reuse ของเดิมที่ user ชอบแล้ว",
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: "optional keyword" },
        limit: { type: Type.INTEGER, description: "default 10, max 20" },
      },
    },
  },
  propose_plan_bulk: {
    name: "propose_plan_bulk",
    description:
      "เสนอแผนหลายวัน (3-31 วัน) เป็น draft — ผู้ใช้ต้อง approve ที่หน้า /dashboard/plan ก่อนถึงจะ apply เข้าตาราง daily_plans จริง. ใช้เมื่อผู้ใช้ขอวางแผนสัปดาห์/เดือน. ห้ามใช้สำหรับวันเดียว — ใช้ update_plan แทน (เขียนตรงทันที). แต่ละ entry ใส่เฉพาะ field ที่ต้องการ (workout_plan และ/หรือ meal_plan). ตอบผู้ใช้ว่า 'ร่างแผน N วันไว้แล้ว เปิดดูและกด Approve ที่หน้าแผน'",
    parameters: {
      type: Type.OBJECT,
      properties: {
        reason: { type: Type.STRING, description: "ทำไมวางแผนชุดนี้ (เก็บใน memory)" },
        plans: {
          type: Type.ARRAY,
          minItems: "1",
          maxItems: "31",
          items: {
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
            },
            required: ["date"],
          },
        },
      },
      required: ["plans"],
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
        TOOL_DECLARATIONS.delete_log_entry,
        TOOL_DECLARATIONS.update_plan,
        TOOL_DECLARATIONS.propose_plan_bulk,
        TOOL_DECLARATIONS.update_memory,
        TOOL_DECLARATIONS.update_profile,
        TOOL_DECLARATIONS.get_history,
        TOOL_DECLARATIONS.get_history_summary,
        TOOL_DECLARATIONS.search_memory,
        TOOL_DECLARATIONS.get_plan,
      ];
    case "nutritionist":
      return [
        TOOL_DECLARATIONS.log_meal,
        TOOL_DECLARATIONS.delete_log_entry,
        TOOL_DECLARATIONS.update_memory,
        TOOL_DECLARATIONS.update_profile,
        TOOL_DECLARATIONS.get_history,
        TOOL_DECLARATIONS.get_history_summary,
        TOOL_DECLARATIONS.search_memory,
        TOOL_DECLARATIONS.find_saved_meal,
      ];
    case "meal_designer":
      return [
        TOOL_DECLARATIONS.propose_meals,
        TOOL_DECLARATIONS.update_plan,
        TOOL_DECLARATIONS.propose_plan_bulk,
        TOOL_DECLARATIONS.update_memory,
        TOOL_DECLARATIONS.update_profile,
        TOOL_DECLARATIONS.get_history_summary,
        TOOL_DECLARATIONS.search_memory,
        TOOL_DECLARATIONS.find_saved_meal,
        TOOL_DECLARATIONS.save_meal,
      ];
    case "reporter":
      return [
        TOOL_DECLARATIONS.get_history,
        TOOL_DECLARATIONS.get_history_summary,
        TOOL_DECLARATIONS.search_memory,
        TOOL_DECLARATIONS.get_plan,
      ];
    case "orchestrator":
      return [];
  }
}

// ===== Handlers =====

export interface ToolContext {
  userId: UserId;
  now: Date;
  source?: string; // e.g., "chat:trainer", "cron:nightly" — recorded on pending_plans
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
        // Self-organize meal library: if logged name matches a saved entry, bump usage.
        // Fire-and-forget — failure shouldn't block the log.
        bumpMealLibraryUsage(ctx.userId, a.food_name).catch(() => {});
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
      case "get_history_summary": {
        const a = GetHistorySummaryArgs.parse(args);
        if (a.type === "macros") {
          const rows = await getDailyMacroSummary(ctx.userId, a.days);
          const days = rows.length;
          const sum = rows.reduce(
            (s, r) => ({
              kcal: s.kcal + r.kcal,
              protein_g: s.protein_g + r.protein_g,
              carb_g: s.carb_g + r.carb_g,
              fat_g: s.fat_g + r.fat_g,
            }),
            { kcal: 0, protein_g: 0, carb_g: 0, fat_g: 0 },
          );
          const avg = days
            ? {
                kcal: Math.round(sum.kcal / days),
                protein_g: round1(sum.protein_g / days),
                carb_g: round1(sum.carb_g / days),
                fat_g: round1(sum.fat_g / days),
              }
            : null;
          return {
            ok: true,
            data: {
              window_days: a.days,
              days_with_logs: days,
              average_per_logged_day: avg,
              daily: rows.map((r) => ({
                date: r.date,
                kcal: r.kcal,
                protein_g: round1(r.protein_g),
                carb_g: round1(r.carb_g),
                fat_g: round1(r.fat_g),
                meal_count: r.meal_count,
              })),
            },
          };
        }
        if (a.type === "workouts") {
          const [byExercise, daily] = await Promise.all([
            getWorkoutSummary(ctx.userId, a.days),
            getWorkoutDailyVolume(ctx.userId, a.days),
          ]);
          return {
            ok: true,
            data: {
              window_days: a.days,
              by_exercise: byExercise.slice(0, 20).map((r) => ({
                exercise: r.exercise,
                sessions: r.sessions,
                total_sets: r.total_sets,
                total_reps: r.total_reps,
                total_volume_kg: round1(r.total_volume_kg),
                max_weight_kg: r.max_weight_kg,
                total_duration_min: r.total_duration_min,
                last_done: r.last_done,
              })),
              daily: daily.map((r) => ({
                date: r.date,
                sessions: r.sessions,
                total_sets: r.total_sets,
                total_volume_kg: round1(r.total_volume_kg),
                total_duration_min: r.total_duration_min,
              })),
            },
          };
        }
        // weight
        const series = await getWeightSeries(ctx.userId, a.days);
        const trend = computeWeightTrend(series);
        return {
          ok: true,
          data: { window_days: a.days, ...trend, series },
        };
      }
      case "update_profile": {
        const a = UpdateProfileArgs.parse(args);
        const parsed = parseProfileValue(a.field, a.value);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        const before = await getUser(ctx.userId);
        if (!before) return { ok: false, error: "user_not_found" };
        const oldVal = (before as Record<string, unknown>)[a.field];
        await updateUser(ctx.userId, { [a.field]: parsed.value });
        // Audit trail — agent_memory key prefix profile_change_*
        const ts = ctx.now.toISOString().slice(0, 16).replace(/[-:T]/g, "");
        await upsertAgentMemory({
          user_id: ctx.userId,
          agent_type: "shared",
          key: `profile_change_${a.field}_${ts}`,
          value: `${a.field}: ${oldVal ?? "(empty)"} → ${parsed.value ?? "(empty)"}${a.reason ? ` — ${a.reason}` : ""}`,
          expires_at: addDays(ctx.now, 90),
        });
        return {
          ok: true,
          data: {
            field: a.field,
            old_value: oldVal ?? null,
            new_value: parsed.value,
          },
        };
      }
      case "delete_log_entry": {
        const a = DeleteLogEntryArgs.parse(args);
        const row =
          a.table === "meals"
            ? await deleteMealById(ctx.userId, a.id)
            : await deleteWorkoutById(ctx.userId, a.id);
        if (!row) return { ok: false, error: "not_found" };
        return {
          ok: true,
          data: { table: a.table, id: a.id, deleted: true },
        };
      }
      case "search_memory": {
        const a = SearchMemoryArgs.parse(args);
        const rows = await searchAgentMemory(ctx.userId, a.query, a.limit);
        return {
          ok: true,
          data: {
            query: a.query,
            count: rows.length,
            results: rows.map((r) => ({
              key: r.key,
              value: r.value,
              scope: r.agent_type,
              updated_at: r.updated_at,
            })),
          },
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
      case "save_meal": {
        const a = SaveMealArgs.parse(args);
        const row = await upsertMealLibraryEntry({
          user_id: ctx.userId,
          name: a.name,
          meal_type: a.meal_type ?? null,
          kcal: Math.round(a.kcal),
          protein_g: a.protein_g,
          carb_g: a.carb_g,
          fat_g: a.fat_g,
          prep_min: a.prep_min ?? null,
          ingredients: a.ingredients ?? null,
          recipe: a.recipe ?? null,
          notes: a.notes ?? null,
        });
        return { ok: true, data: { id: row.id, name: row.name } };
      }
      case "find_saved_meal": {
        const a = FindSavedMealArgs.parse(args);
        const rows = a.query
          ? await findMealLibraryByName(ctx.userId, a.query, a.limit)
          : await listMealLibrary(ctx.userId, a.limit);
        return {
          ok: true,
          data: {
            count: rows.length,
            results: rows.map((r) => ({
              name: r.name,
              meal_type: r.meal_type,
              kcal: r.kcal,
              protein_g: r.protein_g,
              carb_g: r.carb_g,
              fat_g: r.fat_g,
              prep_min: r.prep_min,
              ingredients: r.ingredients,
              times_used: r.times_used,
              last_used_at: r.last_used_at,
            })),
          },
        };
      }
      case "propose_plan_bulk": {
        const a = ProposePlanBulkArgs.parse(args);
        const pending = await insertPendingPlan({
          user_id: ctx.userId,
          source: ctx.source ?? "chat",
          reason: a.reason ?? null,
          plans: a.plans.map((p) => ({
            date: p.date,
            workout_plan: p.workout_plan ?? null,
            meal_plan: p.meal_plan ?? null,
            notes: p.notes ?? null,
          })),
        });
        return {
          ok: true,
          data: {
            pending_id: pending.id,
            count: a.plans.length,
            dates: a.plans.map((p) => p.date),
            status: "pending",
            review_url: "/dashboard/plan",
            note: "Plan saved as draft — user must approve at /dashboard/plan to apply.",
          },
        };
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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function computeWeightTrend(
  series: { date: string; weight_kg: number | null }[],
) {
  const points = series.filter(
    (p): p is { date: string; weight_kg: number } => p.weight_kg !== null,
  );
  if (points.length === 0) {
    return {
      latest: null as { date: string; weight_kg: number } | null,
      delta_7d_kg: null as number | null,
      delta_30d_kg: null as number | null,
    };
  }
  const latest = points[points.length - 1];
  const lookup = (cutoffMs: number) => {
    const candidates = points.filter(
      (p) => new Date(p.date).getTime() <= cutoffMs,
    );
    return candidates.length ? candidates[candidates.length - 1] : null;
  };
  const now = Date.now();
  const ref7 = lookup(now - 7 * 24 * 60 * 60 * 1000);
  const ref30 = lookup(now - 30 * 24 * 60 * 60 * 1000);
  return {
    latest,
    delta_7d_kg: ref7 ? round1(latest.weight_kg - ref7.weight_kg) : null,
    delta_30d_kg: ref30 ? round1(latest.weight_kg - ref30.weight_kg) : null,
  };
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
