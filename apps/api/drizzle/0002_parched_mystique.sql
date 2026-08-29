ALTER TABLE "orders" ADD COLUMN "service_fee" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tip_amount" integer DEFAULT 0 NOT NULL;