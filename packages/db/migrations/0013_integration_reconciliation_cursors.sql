CREATE TABLE "integration_reconciliation_cursors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "cursor" text NOT NULL,
  "reconciled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "integration_reconciliation_cursor_unique" UNIQUE("organization_id","source_id","entity_type"),
  CONSTRAINT "integration_reconciliation_cursor_org_source_fk"
    FOREIGN KEY ("organization_id","source_id")
    REFERENCES "public"."integration_sources"("organization_id","id")
    ON DELETE cascade
);
