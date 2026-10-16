ALTER TABLE "product_variants" ADD COLUMN "compare_at_price" integer;--> statement-breakpoint
-- Clothing's "was" price moves from the product to each size. Carry over what
-- vendors already typed, onto every size it still exceeds — a was-price below
-- a size's own price would advertise a saving that isn't one.
UPDATE "product_variants" AS v
SET "compare_at_price" = p."compare_at_price"
FROM "products" p
JOIN "brands" b ON b."id" = p."brand_id"
JOIN "business_types" t ON t."id" = b."business_type_id"
WHERE v."product_id" = p."id"
  AND t."key" = 'clothing'
  AND p."compare_at_price" IS NOT NULL
  AND p."compare_at_price" > v."base_price";
