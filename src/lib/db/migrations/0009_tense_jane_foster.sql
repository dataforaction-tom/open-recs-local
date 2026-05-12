ALTER TABLE "recommendations" ADD COLUMN "target_organization" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "priority_timescale_id" uuid;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD COLUMN "confidence" text;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_priority_timescale_id_priority_timescales_id_fk" FOREIGN KEY ("priority_timescale_id") REFERENCES "public"."priority_timescales"("id") ON DELETE set null ON UPDATE no action;