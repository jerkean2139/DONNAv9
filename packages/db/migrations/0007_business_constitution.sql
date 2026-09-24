CREATE TYPE "public"."constitution_status" AS ENUM('proposed', 'approved', 'superseded', 'rejected');
--> statement-breakpoint
CREATE TYPE "public"."constitution_rule_kind" AS ENUM('goal_priority', 'definition_of_done', 'role_authority', 'customer_promise', 'communication_brand', 'financial_threshold', 'operational_threshold', 'escalation', 'ai_boundary', 'risk_tolerance', 'never_autonomous');
--> statement-breakpoint
CREATE TABLE "business_constitutions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "status" "constitution_status" DEFAULT 'proposed' NOT NULL,
  "title" text DEFAULT 'Business Constitution' NOT NULL,
  "proposed_by_user_id" uuid,
  "approved_by_user_id" uuid,
  "approved_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "business_constitutions_org_id_unique" UNIQUE("organization_id","id"),
  CONSTRAINT "business_constitutions_org_version_unique" UNIQUE("organization_id","version")
);
--> statement-breakpoint
CREATE TABLE "constitution_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "constitution_id" uuid NOT NULL,
  "kind" "constitution_rule_kind" NOT NULL,
  "key" text NOT NULL,
  "statement" text NOT NULL,
  "action" text,
  "threshold_minor" integer,
  "currency" text,
  "requires_approval" boolean DEFAULT false NOT NULL,
  "never_autonomous" boolean DEFAULT false NOT NULL,
  "structured_value" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "constitution_rules_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "business_constitutions" ADD CONSTRAINT "business_constitutions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_constitutions" ADD CONSTRAINT "business_constitutions_org_proposer_fk" FOREIGN KEY ("organization_id","proposed_by_user_id") REFERENCES "public"."users"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_constitutions" ADD CONSTRAINT "business_constitutions_org_approver_fk" FOREIGN KEY ("organization_id","approved_by_user_id") REFERENCES "public"."users"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "constitution_rules" ADD CONSTRAINT "constitution_rules_org_constitution_fk" FOREIGN KEY ("organization_id","constitution_id") REFERENCES "public"."business_constitutions"("organization_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "business_constitutions_active_idx" ON "business_constitutions" USING btree ("organization_id","status","version");
--> statement-breakpoint
CREATE INDEX "constitution_rules_lookup_idx" ON "constitution_rules" USING btree ("organization_id","constitution_id","kind");