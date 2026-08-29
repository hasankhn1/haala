CREATE TABLE IF NOT EXISTS "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"base_price" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "cart_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "product_variants_product_label_uq" ON "product_variants" USING btree ("product_id","label");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inventory" ADD CONSTRAINT "inventory_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Backfill: one default variant per product, taken from the product's own unit
-- and price. This is what lets variant_id become NOT NULL in the next
-- migration instead of carrying a nullable special case through the order
-- transaction forever.
INSERT INTO "product_variants" ("product_id", "label", "unit", "base_price", "sort_order")
SELECT "id", "unit", "unit", "base_price", 0 FROM "products"
ON CONFLICT ("product_id", "label") DO NOTHING;
--> statement-breakpoint
UPDATE "inventory" i SET "variant_id" = v."id"
FROM "product_variants" v
WHERE v."product_id" = i."product_id" AND i."variant_id" IS NULL;
--> statement-breakpoint
UPDATE "cart_items" c SET "variant_id" = v."id"
FROM "product_variants" v
WHERE v."product_id" = c."product_id" AND c."variant_id" IS NULL;
--> statement-breakpoint
-- Historical order lines get their variant too, so an old order still resolves
-- a size. `product_id` stays on this table regardless: it is what analytics
-- groups by and what the historical record hangs off.
UPDATE "order_items" o SET "variant_id" = v."id"
FROM "product_variants" v
WHERE v."product_id" = o."product_id" AND o."variant_id" IS NULL;
