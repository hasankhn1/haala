-- Brands, phase 1 of 3: expand.
--
-- Everything here is additive and nullable, so it applies to a database that
-- already has products and orders in it. 0007 fills the new columns, 0008
-- tightens them. Splitting it this way is what lets `brand_id` end up NOT NULL
-- without a moment where existing rows violate it.
--
-- Two things drizzle-kit generated that had to be rewritten by hand:
--
--   1. It emitted `ALTER TYPE user_role ADD VALUE 'super_admin'`. That cannot
--      work here — drizzle-orm runs *every* pending migration inside a single
--      transaction (see `migrate()` in pg-core/dialect.js), and Postgres
--      refuses to use an enum value added by ALTER TYPE until the transaction
--      that added it commits. The very next statement, the CHECK constraint
--      referencing 'brand_user', would fail. Recreating the type instead is
--      fully transactional and behaves identically on a fresh database.
--      `users.role` is the type's only dependant, which is what makes the
--      rename-cast-drop safe.
--
--   2. It emitted `ADD COLUMN "brand_id" uuid NOT NULL` on categories and
--      products, which fails outright on a table with rows and no default.
--      Added nullable here; made NOT NULL in 0008 once 0007 has filled it.

ALTER TYPE "public"."user_role" RENAME TO "user_role_old";--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('customer', 'rider', 'admin', 'super_admin', 'brand_user');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."user_role" USING "role"::text::"public"."user_role";--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'customer';--> statement-breakpoint
DROP TYPE "public"."user_role_old";--> statement-breakpoint

CREATE TYPE "public"."brand_status" AS ENUM('pending', 'active', 'suspended', 'rejected');--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "business_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"business_type_id" uuid NOT NULL,
	"status" "brand_status" DEFAULT 'pending' NOT NULL,
	"description" text,
	"logo_url" text,
	"cover_url" text,
	"contact_phone" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "brands" ADD CONSTRAINT "brands_business_type_id_business_types_id_fk" FOREIGN KEY ("business_type_id") REFERENCES "public"."business_types"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "business_types_key_uq" ON "business_types" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brands_slug_uq" ON "brands" USING btree ("slug");--> statement-breakpoint

ALTER TABLE "users" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brand_id" uuid;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "compare_at_price" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "sku" text;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "users" ADD CONSTRAINT "users_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "categories" ADD CONSTRAINT "categories_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
