-- Editorial content for the marketplace home.
--
-- Purely additive: one new table, no column touched on an existing one, so it
-- is safe to run alongside anything else pending. `department_key` is a plain
-- text key rather than a foreign key to `business_types` on purpose — a banner
-- is artwork, and disabling or renaming a department must not delete it.

CREATE TABLE IF NOT EXISTS "home_banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_key" text,
	"title" text NOT NULL,
	"badge" text,
	"image_key" text,
	"link_to" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "home_banners_active_order_idx" ON "home_banners" USING btree ("is_active","sort_order");