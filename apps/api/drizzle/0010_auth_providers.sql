-- Identity becomes plural, and stops being the delivery number.
--
-- Everything here is additive: a new table, a relaxed NOT NULL, a new nullable
-- column. Nothing existing is dropped and no behaviour changes yet.
--
-- drizzle-kit's output needed no rewriting this time — `CREATE TYPE` for a new
-- enum sidesteps the ALTER TYPE trap, and both column changes are safe against
-- rows. The backfill at the bottom is the part it could not know about.

CREATE TYPE "public"."auth_provider" AS ENUM('phone', 'email', 'google', 'apple');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "auth_provider" NOT NULL,
	"provider_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "delivery_phone" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "auth_providers" ADD CONSTRAINT "auth_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_providers_identity_uq" ON "auth_providers" USING btree ("provider","provider_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_providers_user_provider_uq" ON "auth_providers" USING btree ("user_id","provider");

--> statement-breakpoint
-- ── Backfill ───────────────────────────────────────────────────────────────
--
-- Every existing account signed up with phone + password, so each gets one
-- `phone` provider row. Their login keeps working for exactly the same reason
-- it worked yesterday; it is simply now expressed as one route among several.
INSERT INTO "auth_providers" ("user_id", "provider", "provider_user_id")
SELECT "id", 'phone', "phone"
FROM "users"
WHERE "phone" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- And they have already told us a number, so it becomes the delivery contact.
-- Without this the new bottom sheet would open for all 23 of them and ask for
-- something they gave us at signup — which is the one thing the design is
-- explicit about not doing.
UPDATE "users"
SET "delivery_phone" = "phone"
WHERE "phone" IS NOT NULL AND "delivery_phone" IS NULL;
