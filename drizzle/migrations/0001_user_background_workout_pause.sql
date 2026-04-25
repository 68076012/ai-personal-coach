-- Add background context fields to users (used by coach agents)
ALTER TABLE "users" ADD COLUMN "work_hours" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "workout_window" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "budget_per_day_thb" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "pantry_ingredients" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "dietary_notes" text;--> statement-breakpoint
-- Pause-workout-today flag on the daily plan
ALTER TABLE "daily_plans" ADD COLUMN "workout_paused" boolean DEFAULT false NOT NULL;
