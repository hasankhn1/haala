-- Curated "Popular right now" on the marketplace home.
--
-- The section used to rank the first hundred products by discount depth. This
-- replaces that with an editorial list, so the backfill below matters: without
-- it the section would be empty from the moment this deploys until somebody
-- opened the dashboard, and the curation is exclusive — there is no automatic
-- top-up to hide the gap.
--
-- It seeds **one product per category**, which is also the most direct reading
-- of "popular products from all categories": the starting set covers the
-- catalogue by construction, and ops edits from there rather than from nothing.

CREATE TABLE IF NOT EXISTS "home_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "home_products" ADD CONSTRAINT "home_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "home_products_product_uq" ON "home_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "home_products_active_order_idx" ON "home_products" USING btree ("is_active","sort_order");--> statement-breakpoint
-- Backfill: the oldest product in each category, capped at 12 (the grid draws
-- six rows of two). `ON CONFLICT DO NOTHING` so re-running is harmless.
INSERT INTO "home_products" ("product_id", "sort_order")
SELECT id, (row_number() OVER (ORDER BY rank_order)) - 1
FROM (
  SELECT p.id,
         p.created_at AS rank_order,
         row_number() OVER (PARTITION BY p.category_id ORDER BY p.created_at) AS rank_in_cat
  FROM "products" p
  JOIN "brands" b ON b.id = p.brand_id
  WHERE p.is_active AND b.status = 'active'
) ranked
WHERE rank_in_cat = 1
LIMIT 12
ON CONFLICT ("product_id") DO NOTHING;
