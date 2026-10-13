-- "What is included" was removed from the clothing attribute schema. Gift
-- items still use an `includes` key, so only clothing brands' products are
-- touched. The schema is `.strict()` and the dashboard posts back what it
-- loaded, so a leftover key would block the next save.
UPDATE "products" SET "attributes" = "attributes" - 'includes'
WHERE "attributes" ? 'includes'
  AND "brand_id" IN (
    SELECT b."id" FROM "brands" b
    JOIN "business_types" t ON t."id" = b."business_type_id"
    WHERE t."key" = 'clothing'
  );
