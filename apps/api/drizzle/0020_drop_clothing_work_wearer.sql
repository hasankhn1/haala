-- Work / embroidery and Made for were removed from the clothing attribute
-- schema (Made for duplicated the brand's categories). The schema is
-- `.strict()` and the dashboard posts back what it loaded, so strip the keys.
UPDATE "products" SET "attributes" = "attributes" - 'work' - 'wearer'
WHERE "attributes" ?| array['work', 'wearer'];
