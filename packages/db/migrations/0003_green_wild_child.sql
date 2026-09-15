ALTER TABLE "organizations" ADD COLUMN "external_auth_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_external_auth_id_unique" UNIQUE("external_auth_id");