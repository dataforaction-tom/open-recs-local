CREATE TABLE "progress_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"progress_notes" text NOT NULL,
	"evidence_type" text,
	"evidence_url" text,
	"user_progress_rating" text,
	"author_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendation_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"status" text NOT NULL,
	"note" text,
	"set_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"page_anchor" integer,
	"embedding" vector(768),
	"embedding_model" text,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))) STORED,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recommendations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "progress_updates" ADD CONSTRAINT "progress_updates_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendation_statuses" ADD CONSTRAINT "recommendation_statuses_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progress_updates_rec_created_idx" ON "progress_updates" USING btree ("recommendation_id","created_at");--> statement-breakpoint
CREATE INDEX "rec_statuses_rec_created_idx" ON "recommendation_statuses" USING btree ("recommendation_id","created_at");--> statement-breakpoint
CREATE INDEX "recommendations_tsv_idx" ON "recommendations" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "recommendations_embedding_idx" ON "recommendations" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "recommendations_source_idx" ON "recommendations" USING btree ("source_id");