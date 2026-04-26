CREATE TABLE "pending_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" text NOT NULL,
	"reason" text,
	"plans" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "pending_plans" ADD CONSTRAINT "pending_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_pending_plans_user_status" ON "pending_plans" USING btree ("user_id","status","proposed_at");