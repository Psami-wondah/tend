CREATE TABLE "dashboards" (
	"circle_id" text PRIMARY KEY NOT NULL,
	"state" jsonb NOT NULL,
	"saved_by" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_circle_id_circles_id_fk" FOREIGN KEY ("circle_id") REFERENCES "public"."circles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_saved_by_members_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;