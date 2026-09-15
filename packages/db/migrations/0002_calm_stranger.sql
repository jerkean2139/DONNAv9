ALTER TABLE "users" ADD COLUMN "external_auth_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_external_auth_id_unique" UNIQUE("external_auth_id");