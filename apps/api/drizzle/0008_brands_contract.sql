-- Brands, phase 3 of 3: contract.
--
-- Turns the backfilled columns into invariants. Everything here fails loudly if
-- 0007 did not do its job, which is the point: a half-migrated tenant key is
-- worse than a failed deploy.

ALTER TABLE "categories" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "brand_id" SET NOT NULL;--> statement-breakpoint

-- Slugs become unique *per brand*. Two bakeries both wanting `cakes` is the
-- normal case, not a conflict, so the global indexes have to go.
DROP INDEX IF EXISTS "categories_slug_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "products_slug_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "categories_brand_slug_uq" ON "categories" USING btree ("brand_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "products_brand_slug_uq" ON "products" USING btree ("brand_id","slug");--> statement-breakpoint
-- `sku` is nullable and Postgres allows repeated NULLs in a unique index, so
-- this constrains only brands that actually use SKUs.
CREATE UNIQUE INDEX IF NOT EXISTS "products_brand_sku_uq" ON "products" USING btree ("brand_id","sku");--> statement-breakpoint

-- The tenancy invariant. A brand user always has a brand and nobody else ever
-- does, enforced where application code cannot route around it: a bug that
-- creates a brand login without a brand fails here rather than producing an
-- account whose scope is undefined.
ALTER TABLE "users" ADD CONSTRAINT "users_brand_role_ck"
	CHECK (("role" = 'brand_user') = ("brand_id" IS NOT NULL));
