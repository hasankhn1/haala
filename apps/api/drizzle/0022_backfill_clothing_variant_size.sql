-- Clothing sizes moved into `product_variants.options` (size × colour picker).
-- Rows made before that carry the size only in `label`; without `options.size`
-- the dashboard blocks Save and ops cannot stock them. The label *is* the size
-- for these rows ("M", "40", "4-5y"), so copy it across. Grocery and every
-- other type keep `{}`.
--
-- Except the automatic row the dashboard creates with a product, which is
-- named after its subtitle (`label = unit`, "1 piece"). That is a placeholder,
-- not a size: left as `{}` it stays hidden, unstockable, and is renamed into
-- the vendor's first real size.
UPDATE "product_variants" pv SET "options" = jsonb_build_object('size', pv."label")
FROM "products" p
JOIN "brands" b ON b."id" = p."brand_id"
JOIN "business_types" t ON t."id" = b."business_type_id"
WHERE p."id" = pv."product_id"
  AND t."key" = 'clothing'
  AND pv."options" = '{}'::jsonb
  AND pv."label" <> p."unit";
