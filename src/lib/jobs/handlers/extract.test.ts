import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPostgres, type StartedPg } from '../../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../../tests/helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { emitJobEvent, subscribeJobEvents } from '@/lib/jobs/events';
import { createProviders, type Providers } from '@/lib/providers';
import type { JobContext, JobEvent } from '@/lib/jobs/context';
import {
  recommendations,
  recommendationStatuses,
  recommendationsThematicAreas,
  sourceFiles,
  sources,
  thematicAreas,
} from '@/lib/db/schema';
import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput } from '@/lib/providers/llm/types';
import { createFakeLlm } from '@/lib/providers/llm/fake';
import { extractHandler } from './extract';

let pg: StartedPg;
let queue: Queue;
let dbClient: DbClient;
let env: Env;
let baseProviders: Providers;

const fixtureDir = path.resolve(process.cwd(), 'fixtures/sources');
const fixtureFile = 'sample-report.pdf';
const fixtureStem = 'sample-report';
// The shipped fixture has 3 recs; governance/safeguarding/finance slugs.
const FIXTURE_REC_COUNT = 3;

async function seedSource(opts: { filename: string; canonical?: string }): Promise<{ sourceId: string }> {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [srow] = await dbClient.db
    .insert(sources)
    .values({
      slug,
      title: opts.filename,
      canonicalMarkdown: opts.canonical ?? '# Sample report\n\nSome policy text.',
      status: 'extracting',
    })
    .returning({ id: sources.id });
  if (!srow) throw new Error('seed: no source row');
  const sourceId = srow.id;

  // source_files row so the handler can derive the fixture key from the
  // original filename (matches the parse handler's convention).
  await dbClient.db.insert(sourceFiles).values({
    sourceId,
    role: 'original',
    storageKey: `sources/${sourceId}/${opts.filename}`,
    mimeType: 'application/pdf',
    bytes: 1,
  });
  return { sourceId };
}

async function seedThematicAreas(slugs: Array<{ slug: string; name: string }>): Promise<void> {
  await dbClient.db
    .insert(thematicAreas)
    .values(slugs.map((s) => ({ slug: s.slug, name: s.name, colorHex: '#123456' })))
    .onConflictDoNothing({ target: thematicAreas.slug });
}

function ctxWithProviders(providers: Providers): JobContext {
  return {
    queue,
    db: dbClient.db,
    providers,
    env,
    emit: (channelId, event) => emitJobEvent(dbClient.sql, channelId, event),
  };
}

describe('source.extract handler', () => {
  beforeAll(async () => {
    pg = await startPostgres();
    await applyMigrations(pg.url).then(({ sql }) => sql.end());
    dbClient = createDb(pg.url);
    queue = await createQueue({ connectionString: pg.url });
    env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: pg.url,
      LLM_PROVIDER: 'fake',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });
    process.env.FIXTURES_DIR = fixtureDir;
    baseProviders = createProviders(env);

    // Seed the three thematic areas the fixture references.
    await seedThematicAreas([
      { slug: 'governance', name: 'Governance' },
      { slug: 'safeguarding', name: 'Safeguarding' },
      { slug: 'finance', name: 'Finance' },
    ]);
  }, 120_000);

  afterAll(async () => {
    await queue?.stop();
    await dbClient?.sql.end({ timeout: 5 });
    await pg?.container.stop();
  });

  it('happy path: extracts fixture recs, wires taxonomy links, enqueues source.embed', async () => {
    const { sourceId } = await seedSource({ filename: fixtureFile });
    const ctx = ctxWithProviders(baseProviders);

    await extractHandler(ctx, { sourceId });

    const recs = await dbClient.db
      .select({
        id: recommendations.id,
        title: recommendations.title,
        body: recommendations.body,
      })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));
    expect(recs).toHaveLength(FIXTURE_REC_COUNT);
    for (const rec of recs) {
      expect(rec.title.length).toBeGreaterThanOrEqual(5);
      expect(rec.body.length).toBeGreaterThanOrEqual(20);
    }

    // Join rows: 3 recs, each has a known slug in the fixture.
    const joins = await dbClient.db
      .select({ recId: recommendationsThematicAreas.recommendationId })
      .from(recommendationsThematicAreas);
    const recIds = new Set(recs.map((r) => r.id));
    const linkedForSource = joins.filter((j) => recIds.has(j.recId));
    expect(linkedForSource).toHaveLength(FIXTURE_REC_COUNT);

    // One initial status row per rec.
    for (const rec of recs) {
      const statuses = await dbClient.db
        .select({ status: recommendationStatuses.status })
        .from(recommendationStatuses)
        .where(eq(recommendationStatuses.recommendationId, rec.id));
      expect(statuses).toHaveLength(1);
      expect(statuses[0]?.status).toBe('open');
    }

    const [updated] = await dbClient.db
      .select({ status: sources.status })
      .from(sources)
      .where(eq(sources.id, sourceId));
    expect(updated?.status).toBe('embedding');

    const embedJobs = await queue.rawQuery(
      `select id from pgboss.job where name = 'source.embed' and data->>'sourceId' = '${sourceId}'`,
    );
    expect(embedJobs).toHaveLength(1);
  }, 60_000);

  it('skips unrecognised thematic area slugs (rec still inserted, no join)', async () => {
    const { sourceId } = await seedSource({ filename: fixtureFile });

    // In-memory override that includes an unknown slug.
    const llm = createFakeLlm({
      structuredResponses: {
        [fixtureStem]: {
          recommendations: [
            {
              title: 'A real known area',
              full_text: 'This recommendation uses the known governance slug explicitly.',
              thematic_area_slug: 'governance',
            },
            {
              title: 'Something nobody taxonomy has',
              full_text: 'This recommendation references a slug that is not in the thematic_areas table.',
              thematic_area_slug: 'quantum-ethics',
            },
          ],
        },
      },
    });
    const ctx = ctxWithProviders({ ...baseProviders, llm });

    await extractHandler(ctx, { sourceId });

    const recs = await dbClient.db
      .select({ id: recommendations.id, title: recommendations.title })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));
    expect(recs).toHaveLength(2);

    const recIds = new Set(recs.map((r) => r.id));
    const joins = await dbClient.db
      .select({ recId: recommendationsThematicAreas.recommendationId })
      .from(recommendationsThematicAreas);
    const linkedForSource = joins.filter((j) => recIds.has(j.recId));
    // Only the `governance` link survives; the `quantum-ethics` one is skipped.
    expect(linkedForSource).toHaveLength(1);
  }, 60_000);

  it('idempotent: running the handler twice does not accumulate duplicate recs', async () => {
    const { sourceId } = await seedSource({ filename: fixtureFile });
    const ctx = ctxWithProviders(baseProviders);

    await extractHandler(ctx, { sourceId });
    const firstCount = (
      await dbClient.db
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(eq(recommendations.sourceId, sourceId))
    ).length;
    expect(firstCount).toBe(FIXTURE_REC_COUNT);

    await extractHandler(ctx, { sourceId });
    const secondCount = (
      await dbClient.db
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(eq(recommendations.sourceId, sourceId))
    ).length;
    expect(secondCount).toBe(FIXTURE_REC_COUNT);
  }, 60_000);

  it('failure path: LLM throws → status=failed, error event, no source.embed enqueued', async () => {
    const { sourceId } = await seedSource({ filename: fixtureFile });

    const failingLlm: LlmProvider = {
      name: 'failing-fake',
      async generateText() {
        return { text: '' };
      },
      async generateStructured<T>(_input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>> {
        throw new Error('simulated LLM failure');
      },
    };
    const ctx = ctxWithProviders({ ...baseProviders, llm: failingLlm });

    const events: JobEvent[] = [];
    const subDb = createDb(pg.url);
    const unsub = await subscribeJobEvents(subDb.sql, sourceId, (e) => {
      events.push(e);
    });

    await expect(extractHandler(ctx, { sourceId })).rejects.toThrow(/simulated LLM failure/);

    await new Promise((r) => setTimeout(r, 250));
    await unsub();
    await subDb.sql.end({ timeout: 5 });

    const [row] = await dbClient.db
      .select({ status: sources.status })
      .from(sources)
      .where(eq(sources.id, sourceId));
    expect(row?.status).toBe('failed');

    expect(events.some((e) => e.type === 'error' && /simulated LLM failure/.test(e.message))).toBe(true);

    const embedJobs = await queue.rawQuery(
      `select id from pgboss.job where name = 'source.embed' and data->>'sourceId' = '${sourceId}'`,
    );
    expect(embedJobs).toHaveLength(0);
  }, 60_000);

  it('schema violation: LLM returns output failing Zod validation → handler fails cleanly', async () => {
    const { sourceId } = await seedSource({ filename: fixtureFile });

    // Title too short (min(5)) — ExtractionSchema rejects it. Fake will
    // throw the underlying zod error before the handler touches the DB.
    const llm = createFakeLlm({
      structuredResponses: {
        [fixtureStem]: {
          recommendations: [
            { title: 'x', full_text: 'This body is definitely longer than twenty characters.' },
          ],
        },
      },
    });
    const ctx = ctxWithProviders({ ...baseProviders, llm });

    await expect(extractHandler(ctx, { sourceId })).rejects.toThrow(
      // zod's issue message for `min(5)` on a string includes "5 character"
      /5 character|title/i,
    );

    const [row] = await dbClient.db
      .select({ status: sources.status })
      .from(sources)
      .where(eq(sources.id, sourceId));
    expect(row?.status).toBe('failed');

    // No embed enqueue on failure.
    const embedJobs = await queue.rawQuery(
      `select id from pgboss.job where name = 'source.embed' and data->>'sourceId' = '${sourceId}'`,
    );
    expect(embedJobs).toHaveLength(0);

    // Also no recs inserted (transaction never opened).
    const recs = await dbClient.db
      .select({ id: recommendations.id })
      .from(recommendations)
      .where(eq(recommendations.sourceId, sourceId));
    expect(recs).toHaveLength(0);
  }, 60_000);
});
