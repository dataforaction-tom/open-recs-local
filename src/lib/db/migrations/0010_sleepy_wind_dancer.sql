CREATE TABLE "recommendations_location_scopes" (
	"recommendation_id" uuid NOT NULL,
	"location_scope_id" uuid NOT NULL,
	CONSTRAINT "recommendations_location_scopes_recommendation_id_location_scope_id_pk" PRIMARY KEY("recommendation_id","location_scope_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations_purposes" (
	"recommendation_id" uuid NOT NULL,
	"purpose_id" uuid NOT NULL,
	CONSTRAINT "recommendations_purposes_recommendation_id_purpose_id_pk" PRIMARY KEY("recommendation_id","purpose_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations_target_audience_types" (
	"recommendation_id" uuid NOT NULL,
	"target_audience_type_id" uuid NOT NULL,
	CONSTRAINT "recommendations_target_audience_types_recommendation_id_target_audience_type_id_pk" PRIMARY KEY("recommendation_id","target_audience_type_id")
);
--> statement-breakpoint
CREATE TABLE "sources_purposes" (
	"source_id" uuid NOT NULL,
	"purpose_id" uuid NOT NULL,
	CONSTRAINT "sources_purposes_source_id_purpose_id_pk" PRIMARY KEY("source_id","purpose_id")
);
--> statement-breakpoint
CREATE TABLE "sources_role_relevances" (
	"source_id" uuid NOT NULL,
	"role_relevance_id" uuid NOT NULL,
	CONSTRAINT "sources_role_relevances_source_id_role_relevance_id_pk" PRIMARY KEY("source_id","role_relevance_id")
);
--> statement-breakpoint
CREATE TABLE "sources_source_types" (
	"source_id" uuid NOT NULL,
	"source_type_id" uuid NOT NULL,
	CONSTRAINT "sources_source_types_source_id_source_type_id_pk" PRIMARY KEY("source_id","source_type_id")
);
--> statement-breakpoint
CREATE TABLE "sources_target_audience_types" (
	"source_id" uuid NOT NULL,
	"target_audience_type_id" uuid NOT NULL,
	CONSTRAINT "sources_target_audience_types_source_id_target_audience_type_id_pk" PRIMARY KEY("source_id","target_audience_type_id")
);
--> statement-breakpoint
CREATE TABLE "sources_thematic_areas" (
	"source_id" uuid NOT NULL,
	"thematic_area_id" uuid NOT NULL,
	CONSTRAINT "sources_thematic_areas_source_id_thematic_area_id_pk" PRIMARY KEY("source_id","thematic_area_id")
);
--> statement-breakpoint
ALTER TABLE "recommendations_location_scopes" ADD CONSTRAINT "recommendations_location_scopes_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_location_scopes" ADD CONSTRAINT "recommendations_location_scopes_location_scope_id_location_scopes_id_fk" FOREIGN KEY ("location_scope_id") REFERENCES "public"."location_scopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_purposes" ADD CONSTRAINT "recommendations_purposes_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_purposes" ADD CONSTRAINT "recommendations_purposes_purpose_id_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."purposes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_target_audience_types" ADD CONSTRAINT "recommendations_target_audience_types_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations_target_audience_types" ADD CONSTRAINT "recommendations_target_audience_types_target_audience_type_id_target_audience_types_id_fk" FOREIGN KEY ("target_audience_type_id") REFERENCES "public"."target_audience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_purposes" ADD CONSTRAINT "sources_purposes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_purposes" ADD CONSTRAINT "sources_purposes_purpose_id_purposes_id_fk" FOREIGN KEY ("purpose_id") REFERENCES "public"."purposes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_role_relevances" ADD CONSTRAINT "sources_role_relevances_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_role_relevances" ADD CONSTRAINT "sources_role_relevances_role_relevance_id_role_relevances_id_fk" FOREIGN KEY ("role_relevance_id") REFERENCES "public"."role_relevances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_source_types" ADD CONSTRAINT "sources_source_types_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_source_types" ADD CONSTRAINT "sources_source_types_source_type_id_source_types_id_fk" FOREIGN KEY ("source_type_id") REFERENCES "public"."source_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_target_audience_types" ADD CONSTRAINT "sources_target_audience_types_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_target_audience_types" ADD CONSTRAINT "sources_target_audience_types_target_audience_type_id_target_audience_types_id_fk" FOREIGN KEY ("target_audience_type_id") REFERENCES "public"."target_audience_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_thematic_areas" ADD CONSTRAINT "sources_thematic_areas_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources_thematic_areas" ADD CONSTRAINT "sources_thematic_areas_thematic_area_id_thematic_areas_id_fk" FOREIGN KEY ("thematic_area_id") REFERENCES "public"."thematic_areas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recommendations_location_scopes_location_scope_id_idx" ON "recommendations_location_scopes" USING btree ("location_scope_id");--> statement-breakpoint
CREATE INDEX "recommendations_purposes_purpose_id_idx" ON "recommendations_purposes" USING btree ("purpose_id");--> statement-breakpoint
CREATE INDEX "recommendations_target_audience_types_target_audience_type_id_idx" ON "recommendations_target_audience_types" USING btree ("target_audience_type_id");--> statement-breakpoint
CREATE INDEX "sources_purposes_purpose_id_idx" ON "sources_purposes" USING btree ("purpose_id");--> statement-breakpoint
CREATE INDEX "sources_role_relevances_role_relevance_id_idx" ON "sources_role_relevances" USING btree ("role_relevance_id");--> statement-breakpoint
CREATE INDEX "sources_source_types_source_type_id_idx" ON "sources_source_types" USING btree ("source_type_id");--> statement-breakpoint
CREATE INDEX "sources_target_audience_types_target_audience_type_id_idx" ON "sources_target_audience_types" USING btree ("target_audience_type_id");--> statement-breakpoint
CREATE INDEX "sources_thematic_areas_thematic_area_id_idx" ON "sources_thematic_areas" USING btree ("thematic_area_id");