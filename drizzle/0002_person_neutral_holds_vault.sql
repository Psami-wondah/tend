ALTER TABLE "circles" ADD COLUMN "pot_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "circles" ADD COLUMN "story" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "relation" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "vault_token_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "vault_customer_id" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "vault_consent" jsonb;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "funding" text DEFAULT 'pot' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "payer_id" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "payee_email" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "paypal_order_id" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "paypal_authorization_id" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "paypal_capture_id" text;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "hold_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "released_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "stopped_by" text;