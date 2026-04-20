# Phase 1 — Schema + Providers Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up the persistence layer (Drizzle schema over Postgres+pgvector, migrations, Testcontainers-backed tests) and the five provider abstractions (LLM, Embedding, OCR, Storage, AuthContext) with fake implementations and an env-driven factory. No real adapters, no business logic — just the skeleton the rest of the app will build on.

**Architecture:** One Drizzle schema file as the source of truth for DB shape, migrations generated via drizzle-kit and applied by a small migrator; all data-touching tests run against a real pgvector container via Testcontainers (no mocks, no SQLite). Each provider is an interface + a `fake.ts` in the same folder; a factory in `src/lib/providers/index.ts` selects the implementation based on `APP_MODE` + `*_PROVIDER` env vars from the existing Zod-validated env. Repository layer carries a `RepoContext` (user, roles, isSystem) so authorization is enforced in code, not RLS.

**Tech Stack:** drizzle-orm 0.45.x, drizzle-kit 0.31.x, postgres (postgres-js) 3.4.x, @testcontainers/postgresql 11.14.x, pgvector/pgvector:pg16, zod 4.3.x, vitest 3.1.x.

**Reference:**
- Design: `docs/plans/2026-04-19-open-recs-local-design.md`
- Phase-0 plan + Phase 1 milestone outline: `docs/plans/2026-04-19-open-recs-local-plan.md` (lines 277–433)
- Env schema already in place: `src/lib/env.ts`

**Branch:** Create `phase-1-schema-providers` off `master` before Task 1.1.

**Ground rules (from project CLAUDE.md):**
- TS strict, no mocks of the DB, providers ship with `fake.ts` in the same folder, Zod at boundaries, Drizzle is the source of truth.
- Commit prefixes: `feat:` / `fix:` / `chore:` / `docs:` / `test:` / `build:` / `ci:`.
- Run `pnpm verify` at the end of every task where something that verify touches has landed.

---

## Task 1.0 — Pre-flight + branch

**Files:** none created; environment-only.

**Step 1: Confirm clean working tree**

Run:
```
git status --short
git branch --show-current
```

Expected: no output from status; branch is `master`. If unexpected files, stop and ask.

**Step 2: Pull latest master**

Run: `git pull --ff-only`

Expected: already up to date (or fast-forwards cleanly).

**Step 3: Cut phase branch**

Run: `git checkout -b phase-1-schema-providers`

**Step 4: Confirm Docker Desktop is running** (Testcontainers depends on it)

Run: `docker info | grep "Server Version"`

Expected: a version line (e.g. `Server Version: 25.0.3`). If it errors with `The system cannot find the file specified`, stop and ask the user to launch Docker Desktop.

**Step 5: Pre-pull the postgres image** (keeps the first test from timing out on a cold pull)

Run: `docker pull pgvector/pgvector:pg16`

Expected: `Status: Image is up to date` or a successful pull.

No commit.

---

## Task 1.1 — Install Drizzle + postgres client + Testcontainers

**Files:**
- Modify: `package.json` (new deps)
- Create: `src/lib/db/client.ts`
- Create: `src/lib/db/client.test.ts`
- Create: `tests/helpers/pg-container.ts`
- Modify: `vitest.config.mts` (raise `testTimeout` for integration tests)

**Why the container helper:** Multiple tests in this phase (client, migrations, schema, seed, repo) will need a live Postgres. A single shared helper that a test opts into by calling `await startPostgres()` keeps the boilerplate out of each test and lets us reuse one container per file.

**Step 1: Install runtime + dev deps**

Run:
```
pnpm add drizzle-orm@^0.45.0 postgres@^3.4.0
pnpm add -D drizzle-kit@^0.31.0 @testcontainers/postgresql@^11.14.0
```

Expected: install completes, `pnpm-lock.yaml` updates.

**Step 2: Raise vitest's default timeout**

Edit `vitest.config.mts` — add `testTimeout: 60_000` and `hookTimeout: 60_000` to the `test` block (first container pull can take ~30–60s; we want a safe margin).

Expected diff:
```ts
test: {
  include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  environment: 'node',
  testTimeout: 60_000,
  hookTimeout: 60_000,
},
```

**Step 3: Create the container helper**

Create `tests/helpers/pg-container.ts`:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

export type StartedPg = {
  container: StartedPostgreSqlContainer;
  url: string;
};

/**
 * Start a pgvector/pgvector:pg16 container and return the started container + connection URL.
 * Caller is responsible for `container.stop()` in afterAll.
 */
export async function startPostgres(): Promise<StartedPg> {
  const container = await new PostgreSqlContainer('pgvector/pgvector:pg16').start();
  return { container, url: container.getConnectionUri() };
}
```

**Step 4: Write the failing client test**

Create `src/lib/db/client.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { createDb } from './client';

let pg: StartedPg;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.container.stop();
});

describe('createDb', () => {
  it('connects and runs a trivial query', async () => {
    const { db, sql } = createDb(pg.url);
    try {
      const rows = await sql`select 1 as one`;
      expect(rows[0]?.one).toBe(1);
      expect(db).toBeDefined();
    } finally {
      await sql.end();
    }
  });
});
```

**Step 5: Run the test, confirm it fails**

Run: `pnpm test src/lib/db/client.test.ts`

Expected: FAIL — `Cannot find module './client'` (or equivalent). This is the "red" step.

**Step 6: Implement the client**

Create `src/lib/db/client.ts`:

```ts
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

export type Db = PostgresJsDatabase;
export type DbClient = { db: Db; sql: Sql };

export function createDb(url: string): DbClient {
  const sql = postgres(url, { max: 10, prepare: false });
  const db = drizzle(sql);
  return { db, sql };
}
```

`prepare: false` — required because we will later use `pg_notify` and some DDL patterns that don't play nicely with postgres-js prepared statements; also avoids a class of "prepared statement already exists" issues when reusing the pool in tests.

**Step 7: Run the test, confirm it passes**

Run: `pnpm test src/lib/db/client.test.ts`

Expected: PASS (1 test).

**Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.mts src/lib/db/client.ts src/lib/db/client.test.ts tests/helpers/pg-container.ts
git commit -m "feat: drizzle + postgres-js client with testcontainers harness"
```

---

## Task 1.2 — drizzle-kit config + migration runner

**Files:**
- Create: `drizzle.config.ts`
- Create: `src/lib/db/migrate.ts`
- Create: `src/lib/db/migrations/` (empty directory — drizzle-kit will populate)

**Step 1: Write drizzle-kit config**

Create `drizzle.config.ts`:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/lib/db/schema.ts',
  out: './src/lib/db/migrations',
  dialect: 'postgresql',
  strict: true,
  verbose: true,
});
```

Note: no `dbCredentials` block — `drizzle-kit generate` doesn't need a DB connection; `drizzle-kit push` does but we won't use push.

**Step 2: Add package scripts**

Edit `package.json` `scripts`:
- Add `"db:generate": "drizzle-kit generate"`
- Add `"db:migrate": "tsx src/lib/db/migrate.ts"` (CLI migrator entry — used by `docker compose up` later and by tests via a helper)

Install `tsx` if not already present: run `pnpm view tsx version` to check the current major, then `pnpm add -D tsx@^<major>.0.0`.

**Step 3: Implement the migration runner**

Create `src/lib/db/migrate.ts`:

```ts
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { env } from '../env';

async function main() {
  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false });
  const db = drizzle(sql);
  await migrate(db, { migrationsFolder: './src/lib/db/migrations' });
  await sql.end();
  console.log('migrations applied');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

This file is both the CLI entry (`pnpm db:migrate`) and the shape tests will reuse via a helper next task.

**Step 4: Create the migrations directory**

Run: `mkdir -p src/lib/db/migrations` then `touch src/lib/db/migrations/.gitkeep`.

(Drizzle will overwrite this once schema tasks generate real SQL, but we want the folder tracked now.)

**Step 5: Commit**

```bash
git add drizzle.config.ts package.json pnpm-lock.yaml src/lib/db/migrate.ts src/lib/db/migrations/.gitkeep
git commit -m "build: drizzle-kit config + migration runner"
```

No test yet — the runner is exercised end-to-end by Task 1.3's schema test, which applies migrations inside a container.

---

## Task 1.3 — Enable pgvector via a hand-written first migration

**Why hand-written:** drizzle-kit doesn't emit `CREATE EXTENSION`. We need the extension in place before any schema file that declares a `vector(...)` column will apply. So the canonical way is to prepend a hand-written SQL migration.

**Files:**
- Create: `src/lib/db/migrations/0000_enable_extensions.sql`
- Create: `tests/helpers/migrate.ts`
- Create: `src/lib/db/migrations.test.ts`

**Step 1: Write the hand-rolled migration**

Create `src/lib/db/migrations/0000_enable_extensions.sql`:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Step 2: Create a test-side migration helper**

Create `tests/helpers/migrate.ts`:

```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'node:path';

/**
 * Apply migrations to a fresh database. Returns the `sql` client so the caller
 * can run assertions, and stops it themselves in afterAll.
 */
export async function applyMigrations(url: string) {
  const sql = postgres(url, { max: 1, prepare: false });
  const db = drizzle(sql);
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), 'src/lib/db/migrations'),
  });
  return { db, sql };
}
```

**Step 3: Write the failing migrations test**

Create `src/lib/db/migrations.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';

let pg: StartedPg;

beforeAll(async () => {
  pg = await startPostgres();
});

afterAll(async () => {
  await pg?.container.stop();
});

describe('migrations', () => {
  it('install the vector extension', async () => {
    const { sql } = await applyMigrations(pg.url);
    try {
      const rows = await sql<{ installed: boolean }[]>`
        select exists(
          select 1 from pg_extension where extname = 'vector'
        ) as installed
      `;
      expect(rows[0]?.installed).toBe(true);
    } finally {
      await sql.end();
    }
  });
});
```

**Step 4: Run the test, confirm it passes**

Run: `pnpm test src/lib/db/migrations.test.ts`

Expected: PASS (Drizzle's migrator reads the `.sql` file we just placed).

If it fails with "no migrations folder" or similar, verify the `.sql` file is where the test expects it and `migrations` folder has no `__` prefix requirement (drizzle-kit uses plain numeric prefixes; the migrator picks up both).

**Step 5: Commit**

```bash
git add src/lib/db/migrations/0000_enable_extensions.sql tests/helpers/migrate.ts src/lib/db/migrations.test.ts
git commit -m "feat: pgvector extension migration"
```

---

## Task 1.4 — Schema: sources + source_files + source_pages

**Why split the schema across 3 tasks:** The design has ~13 tables. Landing them in one commit makes test failures hard to bisect and migration diffs hard to review. Splitting by aggregate (source / recommendation / taxonomy+misc) keeps each commit legible.

**Files:**
- Create: `src/lib/db/schema.ts` (initial — sources, source_files, source_pages)
- Create: `src/lib/db/schema.test.ts`
- Create: `src/lib/db/migrations/0001_source_tables.sql` (drizzle-kit generated)

**Step 1: Write the failing schema test**

Create `src/lib/db/schema.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';

let pg: StartedPg;
let sql: Awaited<ReturnType<typeof applyMigrations>>['sql'];

beforeAll(async () => {
  pg = await startPostgres();
  ({ sql } = await applyMigrations(pg.url));
});

afterAll(async () => {
  await sql?.end();
  await pg?.container.stop();
});

async function tableExists(name: string): Promise<boolean> {
  const rows = await sql<{ exists: boolean }[]>`
    select exists(
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = ${name}
    ) as exists
  `;
  return rows[0]?.exists === true;
}

describe('schema — sources aggregate', () => {
  it('creates sources, source_files, source_pages', async () => {
    expect(await tableExists('sources')).toBe(true);
    expect(await tableExists('source_files')).toBe(true);
    expect(await tableExists('source_pages')).toBe(true);
  });

  it('source_pages.embedding is a vector column', async () => {
    const rows = await sql<{ data_type: string; udt_name: string }[]>`
      select data_type, udt_name from information_schema.columns
      where table_name = 'source_pages' and column_name = 'embedding'
    `;
    expect(rows[0]?.udt_name).toBe('vector');
  });

  it('sources has a generated tsv tsvector column', async () => {
    const rows = await sql<{ udt_name: string; is_generated: string }[]>`
      select udt_name, is_generated from information_schema.columns
      where table_name = 'sources' and column_name = 'tsv'
    `;
    expect(rows[0]?.udt_name).toBe('tsvector');
    expect(rows[0]?.is_generated).toBe('ALWAYS');
  });
});
```

**Step 2: Run the test, confirm it fails**

Run: `pnpm test src/lib/db/schema.test.ts`

Expected: FAIL — `sources` etc. don't exist. (Or it may fail earlier at import-time because `schema.ts` doesn't exist — that's fine, still red.)

**Step 3: Implement the schema file for the sources aggregate**

Create `src/lib/db/schema.ts`:

```ts
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
} from 'drizzle-orm/pg-core';

export const EMBEDDING_DIM = 768 as const;

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
    tsv: text('tsv').generatedAlwaysAs(
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
```

Notes on choices:
- `EMBEDDING_DIM = 768` matches `.env.example` default. When we later make it configurable, it'll be via a build-time constant, not per-row.
- `owner_user_id` is `uuid` without a FK to `users` yet — users/Better-auth come later; the FK is added when that table exists.
- `tsv` uses `generatedAlwaysAs` (Drizzle 0.45 API) — drizzle-kit will emit `GENERATED ALWAYS AS (...) STORED`.
- HNSW index with `vector_cosine_ops` — matches what the embed service will build against. Rebuilding the index is cheap enough if we change ops class later.

**Step 4: Generate the migration**

Run: `pnpm db:generate`

Expected: a new file `src/lib/db/migrations/0001_<name>.sql` is produced. Inspect it — you should see `CREATE TABLE "sources"`, `CREATE TABLE "source_files"`, `CREATE TABLE "source_pages"`, the GIN and HNSW indexes. If it emits a `DROP EXTENSION` or otherwise destructive SQL, stop and investigate (drizzle-kit occasionally over-reaches — adjust by hand-editing the generated file).

**Step 5: Run the test, confirm it passes**

Run: `pnpm test src/lib/db/schema.test.ts`

Expected: PASS (3 tests).

**Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/schema.test.ts src/lib/db/migrations/0001_*.sql
git commit -m "feat: schema for sources, source_files, source_pages"
```

---

## Task 1.5 — Schema: recommendations, statuses, progress_updates

**Files:**
- Modify: `src/lib/db/schema.ts` (extend)
- Modify: `src/lib/db/schema.test.ts` (add cases)
- Create: `src/lib/db/migrations/0002_recommendations.sql` (generated)

**Step 1: Extend the failing test**

Add to `src/lib/db/schema.test.ts` a new `describe` block:

```ts
describe('schema — recommendations aggregate', () => {
  it('creates recommendations, recommendation_statuses, progress_updates', async () => {
    expect(await tableExists('recommendations')).toBe(true);
    expect(await tableExists('recommendation_statuses')).toBe(true);
    expect(await tableExists('progress_updates')).toBe(true);
  });

  it('recommendations.embedding is a vector(768) column', async () => {
    const rows = await sql<{ udt_name: string }[]>`
      select udt_name from information_schema.columns
      where table_name = 'recommendations' and column_name = 'embedding'
    `;
    expect(rows[0]?.udt_name).toBe('vector');
  });

  it('recommendation_statuses is append-only shaped (no update trigger assumed; shape check only)', async () => {
    expect(await tableExists('recommendation_statuses')).toBe(true);
  });
});
```

Run the test — expect the new cases to FAIL (tables don't exist yet).

**Step 2: Extend `schema.ts`**

Append to `src/lib/db/schema.ts`:

```ts
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
    tsv: text('tsv').generatedAlwaysAs(
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

/** Append-only status log. Current status is derived via a view in a later task. */
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
```

`evidence_type` and `user_progress_rating` are text (not FK) for now — the reference taxonomies land in Task 1.6 and we add FKs then.

**Step 3: Generate the migration**

Run: `pnpm db:generate`

Inspect the generated `0002_*.sql`. Should contain three `CREATE TABLE`s and their indexes.

**Step 4: Run tests, confirm they pass**

Run: `pnpm test src/lib/db/schema.test.ts`

Expected: PASS — both the old aggregate cases and the new recommendations cases.

**Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/schema.test.ts src/lib/db/migrations/0002_*.sql
git commit -m "feat: schema for recommendations, statuses, progress updates"
```

---

## Task 1.6 — Schema: taxonomies + ownership + job results + analytics cache

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/db/schema.test.ts`
- Create: `src/lib/db/migrations/0003_taxonomy_misc.sql` (generated)

**Tables added in this task:**
- `thematic_areas` (id, slug, name, color_hex, description, created_at)
- `recommendations_thematic_areas` (recommendation_id, thematic_area_id) — composite PK
- `evidence_types` (id, slug, name)
- `progress_ratings` (id, slug, name, weight int)
- `ownership_requests` (same columns as v1 — `id, source_id, requester_email, requester_name, note, status, resolved_by, resolved_at, created_at`)
- `job_results` (id, queue, key, source_id?, stage, status, detail jsonb, created_at) — UI-facing summary of long jobs
- `analytics_cache` (key text pk, value jsonb, computed_at)

**Step 1: Extend the schema test**

Add another `describe` block asserting each of the seven new tables exists, plus a spot-check on `thematic_areas.color_hex` being `text` and `recommendations_thematic_areas` having a composite PK (query `information_schema.table_constraints` for `PRIMARY KEY` where `table_name = 'recommendations_thematic_areas'`).

Run the test — expect FAIL.

**Step 2: Extend `schema.ts`** with the seven tables. Follow these conventions:
- All timestamp columns `{ withTimezone: true }`.
- `slug` columns `.notNull().unique()`.
- `ownership_requests.status` is `text({ enum: ['pending','approved','rejected','withdrawn'] })`, default `'pending'`.
- `recommendations_thematic_areas` uses `primaryKey({ columns: [t.recommendationId, t.thematicAreaId] })` (import `primaryKey` from `drizzle-orm/pg-core`).

**Step 3: Generate the migration**

Run: `pnpm db:generate`

Inspect the generated SQL. Should be `0003_*.sql` with seven `CREATE TABLE`s.

**Step 4: Run tests**

Run: `pnpm test src/lib/db/schema.test.ts`

Expected: all schema test cases pass.

**Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/schema.test.ts src/lib/db/migrations/0003_*.sql
git commit -m "feat: taxonomy, ownership, job_results, analytics_cache schema"
```

---

## Task 1.7 — AuthContext interface + local implementation

**Files:**
- Create: `src/lib/providers/auth/types.ts`
- Create: `src/lib/providers/auth/local.ts`
- Create: `src/lib/providers/auth/local.test.ts`

**Step 1: Write the failing test**

Create `src/lib/providers/auth/local.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { localAuth } from './local';

describe('LocalAuthContext', () => {
  it('always returns system user with admin role', async () => {
    const ctx = await localAuth.getContext(new Request('http://localhost/'));
    expect(ctx.isSystem).toBe(true);
    expect(ctx.user.id).toBe('system');
    expect(ctx.roles).toContain('admin');
  });

  it('ignores any request metadata (cookies, headers) — no auth in local mode', async () => {
    const req = new Request('http://localhost/', {
      headers: { authorization: 'Bearer nope', cookie: 'session=whatever' },
    });
    const ctx = await localAuth.getContext(req);
    expect(ctx.isSystem).toBe(true);
  });
});
```

**Step 2: Run test, confirm it fails**

Run: `pnpm test src/lib/providers/auth/local.test.ts`

Expected: FAIL (`Cannot find module './local'`).

**Step 3: Implement the types**

Create `src/lib/providers/auth/types.ts`:

```ts
export type Role = 'admin' | 'editor' | 'viewer';

export type AuthUser = {
  id: string;
  email?: string;
  name?: string;
};

export type AuthContext = {
  user: AuthUser;
  roles: Role[];
  isSystem: boolean;
};

export interface AuthProvider {
  getContext(req: Request): Promise<AuthContext>;
}
```

**Step 4: Implement the local provider**

Create `src/lib/providers/auth/local.ts`:

```ts
import type { AuthContext, AuthProvider } from './types';

const SYSTEM_CONTEXT: AuthContext = {
  user: { id: 'system', name: 'system' },
  roles: ['admin'],
  isSystem: true,
};

export const localAuth: AuthProvider = {
  async getContext(_req: Request): Promise<AuthContext> {
    return SYSTEM_CONTEXT;
  },
};
```

**Step 5: Run test, confirm it passes**

Run: `pnpm test src/lib/providers/auth/local.test.ts`

Expected: PASS (2 tests).

**Step 6: Commit**

```bash
git add src/lib/providers/auth/types.ts src/lib/providers/auth/local.ts src/lib/providers/auth/local.test.ts
git commit -m "feat: local auth context provider"
```

---

## Task 1.8 — LLM provider interface + fake

**Files:**
- Create: `src/lib/providers/llm/types.ts`
- Create: `src/lib/providers/llm/fake.ts`
- Create: `src/lib/providers/llm/fake.test.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeLlm } from './fake';

describe('fake LLM provider', () => {
  it('generateText echoes prompt with a marker', async () => {
    const llm = createFakeLlm();
    const out = await llm.generateText({ prompt: 'hello world' });
    expect(out.text).toContain('hello world');
    expect(out.text).toContain('[fake-llm]');
  });

  it('generateStructured validates against the provided zod schema', async () => {
    const llm = createFakeLlm({
      structuredResponses: {
        'extract-recs': { recommendations: [{ title: 't', body: 'b' }] },
      },
    });
    const schema = z.object({
      recommendations: z.array(z.object({ title: z.string(), body: z.string() })),
    });
    const out = await llm.generateStructured({
      prompt: 'anything',
      schema,
      key: 'extract-recs',
    });
    expect(out.value.recommendations[0]?.title).toBe('t');
  });

  it('generateStructured throws on schema mismatch', async () => {
    const llm = createFakeLlm({ structuredResponses: { 'x': { wrong: 'shape' } } });
    const schema = z.object({ required: z.string() });
    await expect(
      llm.generateStructured({ prompt: '', schema, key: 'x' }),
    ).rejects.toThrow();
  });
});
```

**Step 2: Run test, confirm it fails.**

Run: `pnpm test src/lib/providers/llm/fake.test.ts`

Expected: FAIL.

**Step 3: Implement the types**

Create `src/lib/providers/llm/types.ts`:

```ts
import type { z } from 'zod';

export type LlmTextInput = {
  prompt: string;
  system?: string;
  temperature?: number;
};

export type LlmTextOutput = {
  text: string;
};

export type LlmStructuredInput<T> = {
  prompt: string;
  schema: z.ZodType<T>;
  system?: string;
  /** Key used by the fake to look up a canned response. Ignored by real adapters. */
  key?: string;
};

export type LlmStructuredOutput<T> = {
  value: T;
};

export interface LlmProvider {
  readonly name: string;
  generateText(input: LlmTextInput): Promise<LlmTextOutput>;
  generateStructured<T>(input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>>;
}
```

**Step 4: Implement the fake**

Create `src/lib/providers/llm/fake.ts`:

```ts
import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput, LlmTextInput, LlmTextOutput } from './types';

export type FakeLlmConfig = {
  /** Map of key → object, used by generateStructured. */
  structuredResponses?: Record<string, unknown>;
};

export function createFakeLlm(config: FakeLlmConfig = {}): LlmProvider {
  const responses = config.structuredResponses ?? {};
  return {
    name: 'fake',
    async generateText(input: LlmTextInput): Promise<LlmTextOutput> {
      return { text: `[fake-llm] ${input.prompt}` };
    },
    async generateStructured<T>(input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>> {
      const key = input.key ?? 'default';
      const raw = responses[key];
      if (raw === undefined) {
        throw new Error(`fake LLM: no structured response registered for key="${key}"`);
      }
      const value = input.schema.parse(raw);
      return { value };
    },
  };
}
```

**Step 5: Run test, confirm it passes**

Run: `pnpm test src/lib/providers/llm/fake.test.ts`

Expected: PASS (3 tests).

**Step 6: Commit**

```bash
git add src/lib/providers/llm/types.ts src/lib/providers/llm/fake.ts src/lib/providers/llm/fake.test.ts
git commit -m "feat: llm provider interface + fake"
```

---

## Task 1.9 — Embedding provider interface + fake

**Files:**
- Create: `src/lib/providers/embedding/types.ts`
- Create: `src/lib/providers/embedding/fake.ts`
- Create: `src/lib/providers/embedding/fake.test.ts`

**Interface:**
```ts
export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}
```

**Fake behavior:** deterministic — hash each input text with a stable hash (use Node's `crypto.createHash('sha256')`), expand the digest bytes into a 768-length number[] normalized to unit length. Same input ⇒ same vector; different inputs ⇒ different vectors. `dimensions` configurable on construction so tests can use smaller dims if needed but defaults to 768 (matches `EMBEDDING_DIM`).

**Step 1: Write the failing test** — covers (a) `embed(['a','b'])` returns 2 vectors each of length 768, (b) same text produces byte-for-byte identical vectors across calls, (c) vectors are unit-length within a tolerance (sum of squares ≈ 1).

**Step 2: Fail, implement, pass, commit.** Commit: `feat: embedding provider interface + fake`.

---

## Task 1.10 — OCR provider interface + fake

**Files:**
- Create: `src/lib/providers/ocr/types.ts`
- Create: `src/lib/providers/ocr/fake.ts`
- Create: `src/lib/providers/ocr/fake.test.ts`
- Create: `fixtures/ocr/sample-report.md` (fake's backing content)

**Interface:**
```ts
export type ParsedPage = {
  pageNumber: number;
  markdown: string;
  imageRefs: string[];
};
export type ParsedDocument = {
  markdown: string;
  pages: ParsedPage[];
  metadata: Record<string, unknown>;
};
export interface OcrProvider {
  readonly name: string;
  parseDocument(input: { filename: string; bytes: Buffer }): Promise<ParsedDocument>;
}
```

**Fake behavior:** looks up a fixture by filename (e.g. `sample-report.pdf` → `fixtures/ocr/sample-report.md`). Splits the fixture on `\n---\n` separators as page breaks, synthesises `{ pageNumber, markdown, imageRefs: [] }` per chunk, returns `{ markdown: joined, pages, metadata: { filename } }`.

**Fixture content** (`fixtures/ocr/sample-report.md`):
```
# Page One

This is the first page of a fake report used by the OCR fake in tests.

---

# Page Two

Second page content, distinct from page one so tests can assert page splitting.
```

**Test cases:**
- `parseDocument({filename:'sample-report.pdf', bytes:Buffer.from('')})` returns 2 pages
- Page 1 markdown contains "Page One"; Page 2 contains "Page Two"
- `metadata.filename === 'sample-report.pdf'`
- Missing fixture → throws a clear error (`fake OCR: no fixture found for "whatever.pdf"`)

Fail → implement → pass → commit: `feat: ocr provider interface + fake`.

---

## Task 1.11 — Storage provider interface + fake

**Files:**
- Create: `src/lib/providers/storage/types.ts`
- Create: `src/lib/providers/storage/fake.ts`
- Create: `src/lib/providers/storage/fake.test.ts`

**Interface:**
```ts
export interface StorageProvider {
  readonly name: string;
  put(key: string, bytes: Buffer, opts?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, opts?: { expiresInSeconds?: number }): Promise<string>;
}
```

**Fake behavior:** `Map<string, { bytes: Buffer; contentType?: string }>`. `signedUrl` returns `fake-storage://<key>`.

**Test cases:**
- put → get round-trips bytes exactly
- exists is false before put, true after, false after delete
- get on missing key throws
- signedUrl returns the `fake-storage://` scheme

Fail → implement → pass → commit: `feat: storage provider interface + fake`.

---

## Task 1.12 — Provider factory

**Files:**
- Create: `src/lib/providers/index.ts`
- Create: `src/lib/providers/index.test.ts`

**Shape:**
```ts
export type Providers = {
  auth: AuthProvider;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  ocr: OcrProvider;
  storage: StorageProvider;
};

export function createProviders(env: Env): Providers;
```

**Selection rules (this phase — only fakes are wired; real adapters come in Phase 2):**
| Env | Auth | LLM | Embedding | OCR | Storage |
|---|---|---|---|---|---|
| `APP_MODE=local`, all providers defaulted/`fake` | localAuth | fakeLlm | fakeEmbedding | fakeOcr | fakeStorage |
| Any `_PROVIDER` set to a non-fake value in Phase 1 | throw `"provider <kind>=<value> is not wired yet"` |

**Step 1: Write failing test** — three cases:
1. `createProviders(localEnv)` returns an object whose `llm.name === 'fake'`, `embedding.name === 'fake'`, etc., and `auth` is `localAuth`.
2. `createProviders({ ...localEnv, LLM_PROVIDER: 'anthropic' } as any)` throws with a message including `anthropic` and `not wired yet`.
3. `createProviders({ ...localEnv, APP_MODE: 'hosted', BETTER_AUTH_SECRET: 'x'.repeat(32), BETTER_AUTH_URL: 'http://localhost:3000' })` throws with `"hosted auth is not wired yet"` (Better-auth lands in a later phase).

Use the existing `envSchema` from `src/lib/env.ts` to produce `localEnv` inside the test — do not duplicate the env shape.

**Step 2: Fail → implement → pass.** Implementation is a `switch` on each `*_PROVIDER` field.

**Step 3: Commit:** `feat: provider factory with fake wiring`.

---

## Task 1.13 — Taxonomy seed

**Files:**
- Create: `seeds/taxonomy.ts` (data only — TS constants)
- Create: `src/scripts/seed.ts` (CLI entry)
- Create: `src/scripts/seed.test.ts`
- Modify: `package.json` — add `"db:seed": "tsx src/scripts/seed.ts"`

**Seed data (minimum viable, expandable later):**

```ts
// seeds/taxonomy.ts
export const THEMATIC_AREAS = [
  { slug: 'governance', name: 'Governance', colorHex: '#4f46e5' },
  { slug: 'operations', name: 'Operations', colorHex: '#059669' },
  { slug: 'finance', name: 'Finance', colorHex: '#d97706' },
  { slug: 'safeguarding', name: 'Safeguarding', colorHex: '#dc2626' },
  { slug: 'engagement', name: 'Engagement', colorHex: '#7c3aed' },
] as const;

export const EVIDENCE_TYPES = [
  { slug: 'document', name: 'Document' },
  { slug: 'url', name: 'URL' },
  { slug: 'internal-note', name: 'Internal note' },
  { slug: 'interview', name: 'Interview' },
] as const;

export const PROGRESS_RATINGS = [
  { slug: 'no-progress', name: 'No progress', weight: 0 },
  { slug: 'some-progress', name: 'Some progress', weight: 25 },
  { slug: 'significant-progress', name: 'Significant progress', weight: 75 },
  { slug: 'fully-implemented', name: 'Fully implemented', weight: 100 },
] as const;
```

**Seed script:** opens a DB client using `env.DATABASE_URL`, runs `INSERT ... ON CONFLICT (slug) DO UPDATE SET ...` for each list. Idempotent.

**Test:**
- Spin up a container, apply migrations, run the seed programmatically (export a `seedTaxonomy(db)` function from `src/scripts/seed.ts` that the CLI wrapper calls too).
- Assert row counts match the constants.
- Run `seedTaxonomy(db)` a second time → row counts unchanged → no duplicate key error.

Fail → implement → pass → commit: `feat: idempotent taxonomy seed`.

---

## Task 1.14 — Repository layer types + source repo

This task establishes the `RepoContext` pattern and delivers the first repository (`sources`). The remaining repositories follow the same pattern and will land in Phase 2 next to the services that need them.

**Files:**
- Create: `src/lib/repositories/types.ts`
- Create: `src/lib/repositories/source.ts`
- Create: `src/lib/repositories/source.test.ts`

**RepoContext type:**

```ts
// src/lib/repositories/types.ts
import type { AuthContext } from '../providers/auth/types';
import type { Db } from '../db/client';

export type RepoContext = {
  db: Db;
  auth: AuthContext;
};

export class AuthorizationError extends Error {
  constructor(message = 'not authorized') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}
```

**Source repo surface (narrow — just what this task needs to prove the pattern):**

```ts
// src/lib/repositories/source.ts
export async function createSource(ctx: RepoContext, input: {
  slug: string; title: string; isPrivate?: boolean; ownerUserId?: string | null;
}): Promise<{ id: string; slug: string }>;

export async function findSourceBySlug(ctx: RepoContext, slug: string): Promise<{
  id: string; slug: string; title: string; isPrivate: boolean; ownerUserId: string | null;
} | null>;
```

**Authorization rule for this phase:**
- `createSource`: allowed if `ctx.auth.isSystem` OR `ctx.auth.roles` includes `admin` or `editor`. Otherwise throw `AuthorizationError`.
- `findSourceBySlug`: returns the row if (a) the source is public OR (b) `ctx.auth.isSystem` OR (c) `ctx.auth.user.id === row.owner_user_id`. Otherwise returns `null` (treat private sources as invisible, not as a permission error, to avoid enumeration).

**Test cases (all using a real container):**
1. `createSource` with local/system ctx → row exists in DB.
2. `createSource` with a `{ isSystem: false, roles: ['viewer'] }` ctx → throws `AuthorizationError`, no row written.
3. `findSourceBySlug` returns a public source for any ctx (viewer, system, unauth-ish).
4. `findSourceBySlug` returns `null` for a private source when ctx is a different user (`user.id !== ownerUserId` and not system).
5. `findSourceBySlug` returns the row when ctx is the owner.
6. `findSourceBySlug` returns the row when ctx is system.

**Fixture pattern inside the test file:**

```ts
function ctxSystem(db: Db): RepoContext {
  return { db, auth: { user: { id: 'system' }, roles: ['admin'], isSystem: true } };
}
function ctxUser(db: Db, userId: string, roles: Role[] = ['viewer']): RepoContext {
  return { db, auth: { user: { id: userId }, roles, isSystem: false } };
}
```

**Step 1–5:** Failing tests → implement → passing tests → commit: `feat: repo context + source repository`.

---

## Task 1.15 — End-of-phase verify, PR, squash-merge

**Step 1: Full verify**

Run: `pnpm verify`

Expected: typecheck + lint + all vitest tests + build all green. Total runtime likely 2–4 minutes due to container starts.

If any integration test flakes on container startup, retry once; if it flakes twice, investigate before continuing.

**Step 2: Smoke-run the stack end-to-end**

```
docker compose up -d
# Wait for postgres to be healthy (healthcheck in compose handles this)
docker compose exec app pnpm db:migrate
docker compose exec app pnpm db:seed
curl -fsS -o /dev/null -w "HTTP %{http_code}\n" http://localhost:3000
docker compose down
```

Expected: migrate + seed complete without error, HTTP 200 from the app.

**Step 3: Push branch**

```
git push -u origin phase-1-schema-providers
```

**Step 4: Open PR**

```
gh pr create --base master --head phase-1-schema-providers --title "phase 1: schema + providers" --body "..."
```

Body should call out: schema tables added, migrations count, provider fakes wired, factory threshold, remaining Phase 1 items deferred (none expected — this plan is the full Phase 1).

**Step 5: Await CI, squash-merge, delete branch**

```
gh pr merge <number> --squash --delete-branch
git checkout master && git pull --ff-only
```

**Step 6: Housekeeping**

Update `PLAN.md` — mark Phase 1 complete, surface the Phase 2 entry points (pg-boss install, first real adapter, worker entry).

Commit on master:
```
git add PLAN.md
git commit -m "docs: mark phase 1 complete"
git push
```

---

## Phase 1 exit criteria (must all be true before starting Phase 2)

- [ ] `pnpm verify` passes end-to-end on the branch (and on CI post-merge).
- [ ] Drizzle schema covers the 13 tables in the design doc; migrations apply cleanly to an empty pgvector/pg16 DB.
- [ ] All five provider abstractions have a `types.ts` + `fake.ts` + `fake.test.ts` in `src/lib/providers/<kind>/`.
- [ ] `createProviders(env)` returns fakes for a local-mode env and throws helpfully for any non-fake provider string.
- [ ] `sourceRepo` exists with create + find, authorization via `RepoContext`, real-DB test coverage.
- [ ] `pnpm db:seed` is idempotent against the taxonomy tables.
- [ ] Phase branch squash-merged into `master`.

---

## Notes for the executor

- **Container reuse across tests.** Each `.test.ts` that starts a container pays the startup cost once per file. Don't share a container across files — Vitest runs files in parallel by default and the cross-file coupling is a maintenance trap. If you find yourself wanting to, stop and flag.
- **Commit after every green test.** If a task's "Step 5" says PASS, commit. Don't batch across tasks.
- **If drizzle-kit emits unexpected DROPs** (e.g. tries to drop a column that was renamed rather than the explicit `.renameColumnFrom`), hand-edit the generated SQL to make the migration safe. Re-run the test to confirm.
- **Windows line endings.** `git commit` will warn `LF will be replaced by CRLF`; harmless. Don't change `core.autocrlf`.
- **If a provider fake ends up non-trivial** (the embedding one is the most likely), resist adding more behaviour than the tests require. YAGNI — the real adapter will supersede it.
