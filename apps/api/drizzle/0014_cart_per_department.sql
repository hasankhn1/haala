-- One basket per department, instead of one per customer.
--
-- Hand-written rather than generated, because the generated form was
-- `ADD COLUMN "department_key" text NOT NULL`, which fails outright on a table
-- that already has rows. Expand → backfill → contract, in that order.
--
-- The backfill derives each basket's department from what is already in it, so
-- nobody's basket changes meaning. Every existing basket holds one department's
-- items — verified before writing this, and true by construction in production,
-- where grocery is the only department with stock. Steps 6 and 7 handle the
-- mixed case anyway rather than assuming: a stray line moves to a basket of its
-- own instead of being deleted or silently mis-filed.

-- 1. Expand: nullable, so existing rows are legal while we fill them in.
ALTER TABLE "carts" ADD COLUMN "department_key" text;--> statement-breakpoint

-- 2. Backfill from the basket's contents.
UPDATE "carts" c
SET "department_key" = src.key
FROM (
  SELECT ci.cart_id, min(bt.key) AS key
  FROM "cart_items" ci
  JOIN "product_variants" pv ON pv.id = ci.variant_id
  JOIN "products" p ON p.id = pv.product_id
  JOIN "brands" b ON b.id = p.brand_id
  JOIN "business_types" bt ON bt.id = b.business_type_id
  GROUP BY ci.cart_id
) src
WHERE src.cart_id = c.id;--> statement-breakpoint

-- 3. An empty basket has no contents to derive from. Grocery is the default
--    because it is the department every customer already has, not because the
--    value matters — the first thing added rewrites it.
UPDATE "carts" SET "department_key" = 'grocery' WHERE "department_key" IS NULL;--> statement-breakpoint

-- 4/5. Swap the uniqueness rule. Safe in this order: after the backfill each
--      customer still has exactly one basket, so the new pair is unique.
DROP INDEX IF EXISTS "carts_user_uq";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "carts_user_department_uq" ON "carts" USING btree ("user_id","department_key");--> statement-breakpoint

-- 6. Give any stray line a basket to move into. No-ops when there are none.
INSERT INTO "carts" ("user_id", "store_id", "department_key")
SELECT DISTINCT c.user_id, c.store_id, bt.key
FROM "cart_items" ci
JOIN "carts" c ON c.id = ci.cart_id
JOIN "product_variants" pv ON pv.id = ci.variant_id
JOIN "products" p ON p.id = pv.product_id
JOIN "brands" b ON b.id = p.brand_id
JOIN "business_types" bt ON bt.id = b.business_type_id
WHERE bt.key <> c.department_key
ON CONFLICT ("user_id", "department_key") DO NOTHING;--> statement-breakpoint

-- 7. Move the stray lines. The destination baskets are new and therefore empty,
--    so this cannot collide with cart_items_cart_variant_uq.
UPDATE "cart_items" ci
SET "cart_id" = dest.id
FROM "carts" src, "product_variants" pv, "products" p, "brands" b, "business_types" bt, "carts" dest
WHERE src.id = ci.cart_id
  AND pv.id = ci.variant_id
  AND p.id = pv.product_id
  AND b.id = p.brand_id
  AND bt.id = b.business_type_id
  AND bt.key <> src.department_key
  AND dest.user_id = src.user_id
  AND dest.department_key = bt.key;--> statement-breakpoint

-- 8. Contract.
ALTER TABLE "carts" ALTER COLUMN "department_key" SET NOT NULL;
