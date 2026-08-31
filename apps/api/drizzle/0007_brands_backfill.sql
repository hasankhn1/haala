-- Brands, phase 2 of 3: backfill.
--
-- Every category and product that exists today predates brands and belongs to
-- Haala itself. Giving them a real owner — rather than leaving `brand_id` NULL
-- and meaning "ours" — is what lets 0008 make the column NOT NULL. The
-- alternative, a nullable tenant key, puts an `OR brand_id IS NULL` branch in
-- every isolation query, and that branch is exactly where a leak eventually
-- hides.
--
-- Keys here must match `businessTypeSpecs` in @haala/shared; a type with a row
-- but no registry entry rejects all attribute writes rather than accepting
-- unvalidated ones.

INSERT INTO "business_types" ("key", "name", "sort_order") VALUES
	('grocery',       'Grocery',                   0),
	('bakery',        'Bakery',                    1),
	('clothing',      'Clothing',                  2),
	('fresh_produce', 'Fresh fruit & vegetables',  3),
	('frozen_food',   'Frozen food',               4),
	('gifts',         'Gift items',                5)
ON CONFLICT ("key") DO NOTHING;
--> statement-breakpoint

INSERT INTO "brands" ("name", "slug", "business_type_id", "status", "description")
SELECT 'Haala', 'haala', bt."id", 'active',
       'Everyday groceries, delivered across DHA Peshawar.'
FROM "business_types" bt
WHERE bt."key" = 'grocery'
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

UPDATE "categories"
SET "brand_id" = (SELECT "id" FROM "brands" WHERE "slug" = 'haala')
WHERE "brand_id" IS NULL;
--> statement-breakpoint

UPDATE "products"
SET "brand_id" = (SELECT "id" FROM "brands" WHERE "slug" = 'haala')
WHERE "brand_id" IS NULL;
--> statement-breakpoint

-- The existing ops account becomes the platform's super admin. `admin` is kept
-- in the enum, and the ops routes accept either, so this promotion does not
-- take anything away — it only adds brand management to the one account that
-- already runs the store.
UPDATE "users" SET "role" = 'super_admin' WHERE "role" = 'admin';
