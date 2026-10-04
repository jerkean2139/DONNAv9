ALTER TABLE "integration_sources" ADD COLUMN "external_organization_id" text;
UPDATE "integration_sources" SET "external_organization_id" = "organization_id"::text WHERE "external_organization_id" IS NULL;
ALTER TABLE "integration_sources" ALTER COLUMN "external_organization_id" SET NOT NULL;
ALTER TABLE "integration_sources" ADD CONSTRAINT "integration_sources_key_external_org_unique" UNIQUE("key","external_organization_id");
