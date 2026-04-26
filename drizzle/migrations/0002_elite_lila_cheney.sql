CREATE TABLE "meal_library" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"meal_type" text,
	"kcal" integer NOT NULL,
	"protein_g" real NOT NULL,
	"carb_g" real NOT NULL,
	"fat_g" real NOT NULL,
	"prep_min" integer,
	"ingredients" jsonb,
	"notes" text,
	"times_used" integer DEFAULT 0 NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sports_focus" text;--> statement-breakpoint
ALTER TABLE "meal_library" ADD CONSTRAINT "meal_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_meal_library_user_name" ON "meal_library" USING btree ("user_id","name");
