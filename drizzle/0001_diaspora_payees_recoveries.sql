CREATE TABLE "recoveries" (
	"id" text PRIMARY KEY NOT NULL,
	"circle_id" text NOT NULL,
	"intent_id" text NOT NULL,
	"original_intent_id" text NOT NULL,
	"payee_id" text,
	"payee_name" text NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text NOT NULL,
	"paypal_invoice_id" text,
	"requested_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "timezone" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "home_currency" text;--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN "verification_code" text;--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN "verification_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN "verified_by" text;--> statement-breakpoint
ALTER TABLE "payees" ADD COLUMN "added_by" text;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_intent_id_payment_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_original_intent_id_payment_intents_id_fk" FOREIGN KEY ("original_intent_id") REFERENCES "public"."payment_intents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recoveries" ADD CONSTRAINT "recoveries_payee_id_payees_id_fk" FOREIGN KEY ("payee_id") REFERENCES "public"."payees"("id") ON DELETE no action ON UPDATE no action;