-- Notifications: per-customer push preferences, and the once-only marker for
-- the "Arriving" push.
--
-- A user with no preferences row gets the column defaults, so nothing needs
-- backfilling — existing customers keep every push they get today; offers
-- default off, and nothing sends offers yet. The new assignment column is
-- nullable, so it adds cleanly to a table with rows.
CREATE TABLE IF NOT EXISTS "notification_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"order_updates" boolean DEFAULT true NOT NULL,
	"brand_orders" boolean DEFAULT true NOT NULL,
	"payments" boolean DEFAULT true NOT NULL,
	"offers" boolean DEFAULT false NOT NULL,
	"service" boolean DEFAULT true NOT NULL,
	"quiet_hours" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "delivery_assignments" ADD COLUMN "arriving_notified_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
