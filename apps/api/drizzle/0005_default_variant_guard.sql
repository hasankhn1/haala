-- Exactly one default variant per product.
--
-- The catalogue listing joins `product_variants` on `sort_order = 0` to resolve
-- the price and stock shown on a card. That join is only unambiguous if a
-- product cannot have two variants at sort_order 0, so the invariant is
-- enforced here rather than left to application discipline.
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_default_uq"
  ON "product_variants" ("product_id")
  WHERE "sort_order" = 0;
