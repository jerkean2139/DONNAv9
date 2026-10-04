CREATE TABLE IF NOT EXISTS "integration_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "key" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_sources_org_key_unique" UNIQUE("organization_id","key"),
  CONSTRAINT "integration_sources_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_identity_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "external_id" text NOT NULL,
  "donna_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_identity_source_external_unique" UNIQUE("organization_id","source_id","entity_type","external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "integration_inbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "event_id" text NOT NULL,
  "schema_version" text NOT NULL,
  "event_type" text NOT NULL,
  "entity_type" text NOT NULL,
  "external_entity_id" text NOT NULL,
  "correlation_id" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "error" text,
  CONSTRAINT "integration_inbox_source_event_unique" UNIQUE("organization_id","source_id","event_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_identity_map" ADD CONSTRAINT "integration_identity_map_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_identity_map" ADD CONSTRAINT "integration_identity_map_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_identity_map" ADD CONSTRAINT "integration_identity_org_source_fk" FOREIGN KEY ("organization_id","source_id") REFERENCES "public"."integration_sources"("organization_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_inbox" ADD CONSTRAINT "integration_inbox_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_inbox" ADD CONSTRAINT "integration_inbox_source_id_integration_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."integration_sources"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "integration_inbox" ADD CONSTRAINT "integration_inbox_org_source_fk" FOREIGN KEY ("organization_id","source_id") REFERENCES "public"."integration_sources"("organization_id","id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_identity_donna_idx" ON "integration_identity_map" USING btree ("organization_id","entity_type","donna_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_inbox_pending_idx" ON "integration_inbox" USING btree ("organization_id","processed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "integration_inbox_entity_idx" ON "integration_inbox" USING btree ("organization_id","entity_type","external_entity_id");
