ALTER TABLE "sources" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "authors" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "publication_date" date;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "org_owner" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "original_url" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "datasets" jsonb DEFAULT '[]'::jsonb NOT NULL;