-- A product gets a gallery, not one photo.
--
-- `image_url` stays as the cover, denormalised from `images[0]` and kept in
-- step by the service. Cart lines, order items and the customer catalogue all
-- read a single image, and none of them should have to learn about a gallery.
--
-- The backfill seeds the gallery from whatever cover a product already had, so
-- an existing product opens with its photo in place rather than looking as if
-- it had been wiped.
ALTER TABLE "products" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint

UPDATE "products"
SET "images" = jsonb_build_array("image_url")
WHERE "image_url" IS NOT NULL AND "images" = '[]'::jsonb;
