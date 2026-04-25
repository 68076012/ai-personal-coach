CREATE TABLE "agent_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"agent_type" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"weight_kg" real,
	"sleep_hours" real,
	"mood" text,
	"energy" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"workout_plan" jsonb,
	"meal_plan" jsonb,
	"notes" text,
	"generated_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"user_id" text,
	"model" text NOT NULL,
	"agent" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"datetime" timestamp NOT NULL,
	"meal_type" text NOT NULL,
	"food_name" text NOT NULL,
	"kcal" integer NOT NULL,
	"protein_g" real NOT NULL,
	"carb_g" real NOT NULL,
	"fat_g" real NOT NULL,
	"confidence" real,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morning_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"date" date NOT NULL,
	"summary_md" text NOT NULL,
	"questions" jsonb,
	"sent_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sex" text NOT NULL,
	"age" integer NOT NULL,
	"height_cm" real NOT NULL,
	"current_weight_kg" real,
	"goal" text NOT NULL,
	"goal_kcal" integer,
	"goal_protein_g" integer,
	"goal_carb_g" integer,
	"goal_fat_g" integer,
	"activity_level" text,
	"accent_color" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"datetime" timestamp NOT NULL,
	"exercise" text NOT NULL,
	"sets" integer,
	"reps" integer,
	"weight_kg" real,
	"duration_min" integer,
	"rpe" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_memory" ADD CONSTRAINT "agent_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_logs" ADD CONSTRAINT "daily_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_plans" ADD CONSTRAINT "daily_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morning_reports" ADD CONSTRAINT "morning_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_memory_user_agent" ON "agent_memory" USING btree ("user_id","agent_type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_agent_memory_user_agent_key" ON "agent_memory" USING btree ("user_id","agent_type","key");--> statement-breakpoint
CREATE INDEX "idx_conversations_user_agent" ON "conversations" USING btree ("user_id","agent_type","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_logs_user_date" ON "daily_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_daily_plans_user_date" ON "daily_plans" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_llm_calls_date_model" ON "llm_calls" USING btree ("date","model");--> statement-breakpoint
CREATE INDEX "idx_meals_user_datetime" ON "meals" USING btree ("user_id","datetime");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_morning_reports_user_date" ON "morning_reports" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_workouts_user_datetime" ON "workouts" USING btree ("user_id","datetime");