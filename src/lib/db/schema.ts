import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  vector,
  index,
  customType,
} from 'drizzle-orm/pg-core';

export const EMBEDDING_DIM = 768 as const;

/**
 * Postgres `tsvector` column. Drizzle 0.45 has no native helper for tsvector,
 * so we declare a custom type that emits `tsvector` in generated SQL and in
 * drizzle-kit snapshots, avoiding the text/GIN mismatch.
 */
const tsvector = customType<{ data: string }>({
  dataType() {
    return 'tsvector';
  },
});

/** Status values for a source through the parse → extract → embed pipeline. */
export const SOURCE_STATUS = ['pending', 'parsing', 'extracting', 'embedding', 'ready', 'failed'] as const;
export type SourceStatus = (typeof SOURCE_STATUS)[number];

export const sources = pgTable(
  'sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    canonicalMarkdown: text('canonical_markdown'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}).notNull(),
    isPrivate: boolean('is_private').notNull().default(false),
    status: text('status', { enum: SOURCE_STATUS }).notNull().default('pending'),
    ownerUserId: uuid('owner_user_id'),
    tsv: tsvector('tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(canonical_markdown, ''))`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tsvIdx: index('sources_tsv_idx').using('gin', t.tsv),
    statusIdx: index('sources_status_idx').on(t.status),
  }),
);

export const sourceFiles = pgTable('source_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: uuid('source_id')
    .notNull()
    .references(() => sources.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['original', 'page-image', 'extracted-asset'] }).notNull(),
  storageKey: text('storage_key').notNull(),
  mimeType: text('mime_type').notNull(),
  bytes: integer('bytes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sourcePages = pgTable(
  'source_pages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    markdown: text('markdown').notNull(),
    imageRefs: jsonb('image_refs').$type<string[]>().default([]).notNull(),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    embeddingModel: text('embedding_model'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sourcePageIdx: index('source_pages_source_page_idx').on(t.sourceId, t.pageNumber),
    embedIdx: index('source_pages_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
  }),
);

export const REC_STATUS = ['open', 'in_progress', 'done', 'blocked', 'withdrawn'] as const;
export type RecStatus = (typeof REC_STATUS)[number];

export const recommendations = pgTable(
  'recommendations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => sources.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    pageAnchor: integer('page_anchor'),
    embedding: vector('embedding', { dimensions: EMBEDDING_DIM }),
    embeddingModel: text('embedding_model'),
    tsv: tsvector('tsv').generatedAlwaysAs(
      sql`to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))`,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tsvIdx: index('recommendations_tsv_idx').using('gin', t.tsv),
    embedIdx: index('recommendations_embedding_idx').using('hnsw', t.embedding.op('vector_cosine_ops')),
    sourceIdx: index('recommendations_source_idx').on(t.sourceId),
  }),
);

export const recommendationStatuses = pgTable(
  'recommendation_statuses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    status: text('status', { enum: REC_STATUS }).notNull(),
    note: text('note'),
    setByUserId: uuid('set_by_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRecCreated: index('rec_statuses_rec_created_idx').on(t.recommendationId, t.createdAt),
  }),
);

export const progressUpdates = pgTable(
  'progress_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recommendationId: uuid('recommendation_id')
      .notNull()
      .references(() => recommendations.id, { onDelete: 'cascade' }),
    progressNotes: text('progress_notes').notNull(),
    evidenceType: text('evidence_type'),
    evidenceUrl: text('evidence_url'),
    userProgressRating: text('user_progress_rating'),
    authorUserId: uuid('author_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byRecCreated: index('progress_updates_rec_created_idx').on(t.recommendationId, t.createdAt),
  }),
);
