import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  jsonb,
  date,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  sex: text("sex").notNull(),
  age: integer("age").notNull(),
  height_cm: real("height_cm").notNull(),
  current_weight_kg: real("current_weight_kg"),
  goal: text("goal").notNull(),
  goal_kcal: integer("goal_kcal"),
  goal_protein_g: integer("goal_protein_g"),
  goal_carb_g: integer("goal_carb_g"),
  goal_fat_g: integer("goal_fat_g"),
  activity_level: text("activity_level"),
  accent_color: text("accent_color"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().notNull(),
});

export const daily_logs = pgTable(
  "daily_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    date: date("date").notNull(),
    weight_kg: real("weight_kg"),
    sleep_hours: real("sleep_hours"),
    mood: text("mood"),
    energy: integer("energy"),
    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idx_daily_logs_user_date").on(t.user_id, t.date)],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    datetime: timestamp("datetime").notNull(),
    meal_type: text("meal_type").notNull(),
    food_name: text("food_name").notNull(),
    kcal: integer("kcal").notNull(),
    protein_g: real("protein_g").notNull(),
    carb_g: real("carb_g").notNull(),
    fat_g: real("fat_g").notNull(),
    confidence: real("confidence"),
    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_meals_user_datetime").on(t.user_id, t.datetime)],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    datetime: timestamp("datetime").notNull(),
    exercise: text("exercise").notNull(),
    sets: integer("sets"),
    reps: integer("reps"),
    weight_kg: real("weight_kg"),
    duration_min: integer("duration_min"),
    rpe: integer("rpe"),
    notes: text("notes"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_workouts_user_datetime").on(t.user_id, t.datetime)],
);

export const agent_memory = pgTable(
  "agent_memory",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    agent_type: text("agent_type").notNull(),
    key: text("key").notNull(),
    value: text("value").notNull(),
    expires_at: timestamp("expires_at"),
    created_at: timestamp("created_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_agent_memory_user_agent").on(t.user_id, t.agent_type),
    uniqueIndex("idx_agent_memory_user_agent_key").on(
      t.user_id,
      t.agent_type,
      t.key,
    ),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    agent_type: text("agent_type").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    tool_calls: jsonb("tool_calls"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_conversations_user_agent").on(
      t.user_id,
      t.agent_type,
      t.created_at,
    ),
  ],
);

export const daily_plans = pgTable(
  "daily_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    date: date("date").notNull(),
    workout_plan: jsonb("workout_plan"),
    meal_plan: jsonb("meal_plan"),
    notes: text("notes"),
    generated_at: timestamp("generated_at").defaultNow().notNull(),
    updated_at: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("idx_daily_plans_user_date").on(t.user_id, t.date)],
);

export const morning_reports = pgTable(
  "morning_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: text("user_id")
      .references(() => users.id)
      .notNull(),
    date: date("date").notNull(),
    summary_md: text("summary_md").notNull(),
    questions: jsonb("questions"),
    sent_at: timestamp("sent_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("idx_morning_reports_user_date").on(t.user_id, t.date),
  ],
);

export const llm_calls = pgTable(
  "llm_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    date: date("date").notNull(),
    user_id: text("user_id"),
    model: text("model").notNull(),
    agent: text("agent"),
    input_tokens: integer("input_tokens"),
    output_tokens: integer("output_tokens"),
    latency_ms: integer("latency_ms"),
    error: text("error"),
    created_at: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("idx_llm_calls_date_model").on(t.date, t.model)],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Meal = typeof meals.$inferSelect;
export type NewMeal = typeof meals.$inferInsert;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type DailyPlan = typeof daily_plans.$inferSelect;
export type NewDailyPlan = typeof daily_plans.$inferInsert;
export type AgentMemory = typeof agent_memory.$inferSelect;
export type NewAgentMemory = typeof agent_memory.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type DailyLog = typeof daily_logs.$inferSelect;
export type MorningReport = typeof morning_reports.$inferSelect;

export type UserId = "garfield" | "partner" | "test";
export type AgentType =
  | "orchestrator"
  | "trainer"
  | "nutritionist"
  | "meal_designer"
  | "reporter"
  | "shared";
export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
