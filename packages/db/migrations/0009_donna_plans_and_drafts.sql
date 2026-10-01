CREATE TYPE "public"."draft_status" AS ENUM('none', 'drafting', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('drafting', 'proposed', 'approved', 'dismissed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."work_item_owner" AS ENUM('you', 'donna');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "objective_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"status" "plan_status" DEFAULT 'drafting' NOT NULL,
	"plan" jsonb,
	"error" text,
	"model" text,
	"cost_usd" double precision,
	"project_id" uuid,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "objective_plans_objective_unique" UNIQUE("objective_id"),
	CONSTRAINT "objective_plans_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "owner" "work_item_owner" DEFAULT 'you' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft_status" "draft_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft_error" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft_updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objective_plans" ADD CONSTRAINT "objective_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objective_plans" ADD CONSTRAINT "objective_plans_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objective_plans" ADD CONSTRAINT "objective_plans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objective_plans" ADD CONSTRAINT "objective_plans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objective_plans" ADD CONSTRAINT "objective_plans_org_objective_fk" FOREIGN KEY ("organization_id","objective_id") REFERENCES "public"."objectives"("organization_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "objective_plans" ADD CONSTRAINT "objective_plans_org_project_fk" FOREIGN KEY ("organization_id","project_id") REFERENCES "public"."projects"("organization_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "objective_plans_org_idx" ON "objective_plans" USING btree ("organization_id");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "work_items" ADD CONSTRAINT "work_items_org_objective_fk" FOREIGN KEY ("organization_id","objective_id") REFERENCES "public"."objectives"("organization_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "work_items_objective_idx" ON "work_items" USING btree ("organization_id","objective_id");