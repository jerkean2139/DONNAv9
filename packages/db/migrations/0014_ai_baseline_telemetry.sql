CREATE TYPE "public"."token_count_provenance" AS ENUM(
  'PROVIDER_REPORTED',
  'TOKENIZER_CALCULATED',
  'HEURISTIC_ESTIMATE',
  'HARDCODED_ESTIMATE',
  'UNKNOWN'
);
--> statement-breakpoint
CREATE TYPE "public"."data_classification" AS ENUM(
  'PUBLIC',
  'INTERNAL',
  'CONFIDENTIAL',
  'RESTRICTED'
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "project_id" uuid,
  "objective_id" uuid,
  "task_id" uuid,
  "feature" text,
  "task_class" text,
  "route_policy_version" text DEFAULT 'baseline-v1' NOT NULL,
  "provider" text NOT NULL,
  "model_id" text NOT NULL,
  "input_tokens" bigint DEFAULT 0 NOT NULL,
  "cached_input_tokens" bigint DEFAULT 0 NOT NULL,
  "cache_write_tokens" bigint DEFAULT 0 NOT NULL,
  "output_tokens" bigint DEFAULT 0 NOT NULL,
  "reasoning_tokens" bigint DEFAULT 0 NOT NULL,
  "token_provenance" "token_count_provenance" DEFAULT 'UNKNOWN' NOT NULL,
  "latency_ms" integer DEFAULT 0 NOT NULL,
  "retries" integer DEFAULT 0 NOT NULL,
  "fallback_depth" integer DEFAULT 0 NOT NULL,
  "estimated_cost_usd" numeric(14,8),
  "actual_cost_usd" numeric(14,8) DEFAULT '0' NOT NULL,
  "success" boolean DEFAULT true NOT NULL,
  "failure_class" text,
  "local_worker_id" text,
  "local_gpu_seconds" numeric(14,4),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_routing_decisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "user_id" uuid,
  "project_id" uuid,
  "objective_id" uuid,
  "task_id" uuid,
  "correlation_id" uuid,
  "route_policy_version" text NOT NULL,
  "task_class" text,
  "reasoning_tier" integer,
  "data_classification" "data_classification" DEFAULT 'INTERNAL' NOT NULL,
  "candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "selected_route" text NOT NULL,
  "selected_model_id" text,
  "reason" text NOT NULL,
  "expected_cost_usd" numeric(14,8),
  "expected_quality" numeric(6,5),
  "expected_latency_ms" integer,
  "fallback_depth" integer DEFAULT 0 NOT NULL,
  "outcome" text,
  "accepted" boolean,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_routing_decisions" ADD CONSTRAINT "ai_routing_decisions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_routing_decisions" ADD CONSTRAINT "ai_routing_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_routing_decisions" ADD CONSTRAINT "ai_routing_decisions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_routing_decisions" ADD CONSTRAINT "ai_routing_decisions_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "ai_routing_decisions" ADD CONSTRAINT "ai_routing_decisions_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "ai_usage_events_org_created_idx" ON "ai_usage_events" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_usage_events_task_idx" ON "ai_usage_events" USING btree ("organization_id","task_id");
--> statement-breakpoint
CREATE INDEX "ai_usage_events_model_idx" ON "ai_usage_events" USING btree ("organization_id","provider","model_id");
--> statement-breakpoint
CREATE INDEX "ai_routing_decisions_org_created_idx" ON "ai_routing_decisions" USING btree ("organization_id","created_at");
--> statement-breakpoint
CREATE INDEX "ai_routing_decisions_task_idx" ON "ai_routing_decisions" USING btree ("organization_id","task_id");
--> statement-breakpoint
CREATE INDEX "ai_routing_decisions_policy_idx" ON "ai_routing_decisions" USING btree ("organization_id","route_policy_version");
