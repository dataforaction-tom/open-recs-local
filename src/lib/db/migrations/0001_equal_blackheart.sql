CREATE TABLE "source_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"role" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"page_number" integer NOT NULL,
	"markdown" text NOT NULL,
	"image_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"embedding" vector(768),
	"embedding_model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"canonical_markdown" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"owner_user_id" uuid,
	"tsv" tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(canonical_markdown, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sources_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "source_files" ADD CONSTRAINT "source_files_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_pages" ADD CONSTRAINT "source_pages_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_pages_source_page_idx" ON "source_pages" USING btree ("source_id","page_number");--> statement-breakpoint
CREATE INDEX "source_pages_embedding_idx" ON "source_pages" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "sources_tsv_idx" ON "sources" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "sources_status_idx" ON "sources" USING btree ("status");