-- Collection, season and care were removed from the clothing attribute schema.
-- That schema is `.strict()`, and the dashboard sends back the attributes it
-- loaded, so a product still carrying these keys could no longer be saved.
UPDATE "products" SET "attributes" = "attributes" - 'collection' - 'season' - 'careInstructions'
WHERE "attributes" ?| array['collection', 'season', 'careInstructions'];
