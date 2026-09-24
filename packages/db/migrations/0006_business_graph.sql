CREATE TABLE "business_entities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "name" text NOT NULL,
  "source_system" text,
  "source_ref" text,
  "confidence" "source_confidence" DEFAULT 'UNVERIFIED' NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "business_entities_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "business_relationships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL,
  "from_entity_id" uuid NOT NULL,
  "to_entity_id" uuid NOT NULL,
  "relationship_type" text NOT NULL,
  "source_system" text,
  "source_ref" text,
  "confidence" "source_confidence" DEFAULT 'UNVERIFIED' NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "business_relationships_org_id_unique" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "business_entities" ADD CONSTRAINT "business_entities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_relationships" ADD CONSTRAINT "business_relationships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_relationships" ADD CONSTRAINT "business_relationships_from_entity_id_business_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_relationships" ADD CONSTRAINT "business_relationships_to_entity_id_business_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."business_entities"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_relationships" ADD CONSTRAINT "business_relationships_org_from_fk" FOREIGN KEY ("organization_id","from_entity_id") REFERENCES "public"."business_entities"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "business_relationships" ADD CONSTRAINT "business_relationships_org_to_fk" FOREIGN KEY ("organization_id","to_entity_id") REFERENCES "public"."business_entities"("organization_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "business_entities_org_type_idx" ON "business_entities" USING btree ("organization_id","entity_type");
--> statement-breakpoint
CREATE INDEX "business_entities_source_idx" ON "business_entities" USING btree ("organization_id","source_system","source_ref");
--> statement-breakpoint
CREATE INDEX "business_relationships_from_idx" ON "business_relationships" USING btree ("organization_id","from_entity_id");
--> statement-breakpoint
CREATE INDEX "business_relationships_to_idx" ON "business_relationships" USING btree ("organization_id","to_entity_id");
--> statement-breakpoint
CREATE INDEX "business_relationships_type_idx" ON "business_relationships" USING btree ("organization_id","relationship_type");