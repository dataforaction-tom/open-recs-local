CREATE TABLE "analytics_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "evidence_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "job_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"queue" text NOT NULL,
	"key" text NOT NULL,
	"source_id" uuid,
	"stage" text NOT NULL,
	"status" text NOT NULL,
	"detail" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ownership_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"requester_email" text NOT NULL,
	"requester_name" text,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"weight" integer NOT NULL,
	CONSTRAINT "progress_ratings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recommendations_thematic_areas" (
	"recommendation_id" uuid NOT NULL,
	"thematic_area_id" uuid NOT NULL,
	CONSTRAINT "recommendations_thematic_areas_recommendation_id_thematic_area_id_pk" PRIMARY KEY("recommendation_id","thematic_area_id")
);
--> statement-breakpoint
CREATE TABLE "thematic_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "thematic_areas_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "job_results" ADD CONSTRAINT "job_results_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ownership_requests" ADD CONSTRAINT "ownership_requests_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_thematic_areas" ADD CONSTRAINT "recommendations_thematic_areas_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_thematic_areas" ADD CONSTRAINT "recommendations_thematic_areas_thematic_area_id_thematic_areas_id_fk" FOREIGN KEY ("thematic_area_id") REFERENCES "public"."thematic_areas"("id") ON DELETE cascade ON UPDATE no action;