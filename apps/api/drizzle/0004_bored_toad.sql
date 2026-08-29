ALTER TABLE "inventory" DROP CONSTRAINT "inventory_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "cart_items" DROP CONSTRAINT "cart_items_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_store_product_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "cart_items_cart_product_uq";--> statement-breakpoint
ALTER TABLE "inventory" ALTER COLUMN "variant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cart_items" ALTER COLUMN "variant_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_store_variant_uq" ON "inventory" USING btree ("store_id","variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cart_items_cart_variant_uq" ON "cart_items" USING btree ("cart_id","variant_id");--> statement-breakpoint
ALTER TABLE "inventory" DROP COLUMN IF EXISTS "product_id";--> statement-breakpoint
ALTER TABLE "cart_items" DROP COLUMN IF EXISTS "product_id";