CREATE TABLE "location_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"description" text,
	"unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_scopes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "priority_timescales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"description" text,
	"unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "priority_timescales_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "purposes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"description" text,
	"unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purposes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "role_relevances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"description" text,
	"unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_relevances_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "source_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"description" text,
	"unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "target_audience_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"color_hex" text,
	"description" text,
	"unverified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "target_audience_types_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "thematic_areas" ADD COLUMN "unverified" boolean DEFAULT false NOT NULL;