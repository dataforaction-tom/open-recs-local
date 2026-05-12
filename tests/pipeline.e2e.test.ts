import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPostgres, type StartedPg } from './helpers/pg-container';
import { applyMigrations } from './helpers/migrate';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv, type Env } from '@/lib/env';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { emitJobEvent, subscribeJobEvents } from '@/lib/jobs/events';
import { createProviders, type Providers } from '@/lib/providers';
import type { JobContext, JobEvent } from '@/lib/jobs/context';
import { registerHandlers } from '@/lib/jobs/handlers';
import {
  recommendations,
  recommendationsLocationScopes,
  recommendationsPurposes,
  recommendationsTargetAudienceTypes,
  recommendationsThematicAreas,
  sourcePages,
  sources,
  sourcesPurposes,
  sourcesRoleRelevances,
  sourcesSourceTypes,
  sourcesTargetAudienceTypes,
  sourcesThematicAreas,
} from '@/lib/db/schema';
import type { RepoContext } from '@/lib/repositories/types';
import { seedTaxonomy } from '@/scripts/seed';
import { uploadSource } from '@/lib/services/upload-source';

/**
 * End-to-end pipeline test.
 *
 * Boots one Testcontainers Postgres, applies migrations + taxonomy seed, starts
 * one pg-boss Queue, registers all three pipeline handlers, uploads the
 * `sample-report.pdf` fixture via `uploadSource`, then lets pg-boss's own
 * polling worker (registered via `queue.register`) drive parse → extract →
 * embed to completion.
 *
 * Why no explicit `queue.work()` loop: pg-boss v12's `boss.work(name, handler)`
 * registers a polling worker that runs for the lifetime of the boss instance
 * (default ~2s poll cadence). Once handlers are registered, we just wait until
 * `sources.status === 'ready'` and assert on the final DB state. The plan
 * wording said "call queue.work() until ready"; the wrapper's `register` IS
 * the `boss.work` call, so we poll state instead of ticking the worker
 * manually.
 *
 * Why one container / queue / db for both tests: container startup is the
 * slow part (~15-30s); the two tests are independent (each uploads its own
 * source) so they can safely share infra.
 */

const fixtureDir = path.resolve(process.cwd(), 'fixtures/sources');
const fixtureFile = 'sample-report.pdf';
const fixtureStem = 'sample-report';

type FixtureRec = { title: string; body: string };

async function loadFixturePdf(): Promise<Buffer> {
  return readFile(path.join(fixtureDir, fixtureFile));
}

async function loadFixtureRecs(): Promise<FixtureRec[]> {
  const raw = await readFile(
    path.join(fixtureDir, `${fixtureStem}.recommendations.json`),
    'utf8',
  );
  return (JSON.parse(raw) as { recommendations: FixtureRec[] }).recommendations;
}

async function loadFixturePageCount(): Promise<number> {
  const raw = await readFile(path.join(fixtureDir, `${fixtureStem}.canonical.md`), 'utf8');
  // Fake OCR splits on /\r?\n---\r?\n/. Mirror that here.
  return raw.split(/\r?\n---\r?\n/).length;
}

async function pollUntil(
  check: () => Promise<boolean>,
  timeoutMs: number,
  intervalMs = 250,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`pollUntil: condition not met within ${timeoutMs}ms`);
}

let pg: StartedPg;
let queue: Queue;
let dbClient: DbClient;
let env: Env;
let providers: Providers;

function systemRepoCtx(): RepoContext {
  return {
    db: dbClient.db,
    auth: { user: { id: 'system', name: 'system' }, roles: ['admin'], isSystem: true },
  };
}

describe('pipeline e2e', () => {
  beforeAll(async () => {
    pg = await startPostgres();
    await applyMigrations(pg.url).then(({ sql }) => sql.end());
    dbClient = createDb(pg.url);
    // Seed the taxonomy so the extract handler's slug resolution (governance /
    // safeguarding / finance in the fixture) actually links rows, mirroring
    // production setup.
    await seedTaxonomy(dbClient.db);

    queue = await createQueue({ connectionString: pg.url });
    env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: pg.url,
      LLM_PROVIDER: 'fake',
      EMBEDDING_PROVIDER: 'fake',
      OCR_PROVIDER: 'fake',
      STORAGE_PROVIDER: 'fake',
    });
    providers = createProviders(env);

    const ctx: JobContext = {
      queue,
      db: dbClient.db,
      providers,
      env,
      emit: (channelId, event) => emitJobEvent(dbClient.sql, channelId, event),
    };
    await registerHandlers(ctx);
  }, 180_000);

  afterAll(async () => {
    await queue?.stop();
    await dbClient?.sql.end({ timeout: 5 });
    await pg?.container.stop();
  });

  it(
    'full pipeline: upload → ready (happy path)',
    async () => {
      const pdfBytes = await loadFixturePdf();
      const fixtureRecs = await loadFixtureRecs();
      const expectedPageCount = await loadFixturePageCount();

      const { sourceId } = await uploadSource(
        systemRepoCtx(),
        {
          filename: fixtureFile,
          contentType: 'application/pdf',
          bytes: pdfBytes,
          title: 'e2e happy path',
        },
        { storage: providers.storage, queue },
      );

      // Stash bytes for fake OCR: the provider reads the fixture markdown by
      // filename stem, not from storage. Storage still holds the raw PDF so
      // the parse handler's `get()` succeeds, but OCR output is fixture-backed.
      // (See fake OCR / LLM resolution order.)

      // Wait for the terminal state. pg-boss polls ~2s by default and we have
      // three handlers chained — 60s cap is generous without being absurd.
      await pollUntil(
        async () => {
          const [row] = await dbClient.db
            .select({ status: sources.status })
            .from(sources)
            .where(eq(sources.id, sourceId));
          return row?.status === 'ready';
        },
        60_000,
      );

      // Page count from DB matches fixture.
      const pages = await dbClient.db
        .select({ id: sourcePages.id })
        .from(sourcePages)
        .where(eq(sourcePages.sourceId, sourceId));
      expect(pages).toHaveLength(expectedPageCount);

      // Rec count matches fixture.
      const recRows = await dbClient.db
        .select({ id: recommendations.id })
        .from(recommendations)
        .where(eq(recommendations.sourceId, sourceId));
      expect(recRows).toHaveLength(fixtureRecs.length);

      // Every recommendation has a 768-dim non-zero embedding.
      const vecRows = await dbClient.sql<
        { id: string; dim: number; nonzero: number }[]
      >`select id,
               array_length(embedding::real[], 1) as dim,
               (select count(*) from unnest(embedding::real[]) v where v <> 0) as nonzero
          from recommendations
          where source_id = ${sourceId}`;
      expect(vecRows).toHaveLength(fixtureRecs.length);
      for (const row of vecRows) {
        expect(row.dim).toBe(768);
        expect(Number(row.nonzero)).toBeGreaterThan(0);
      }

      // After PR 2: assert source metadata + M2M memberships are populated.
      const [updatedSource] = await dbClient.db
        .select({
          summary: sources.summary,
          authors: sources.authors,
          orgOwner: sources.orgOwner,
        })
        .from(sources)
        .where(eq(sources.id, sourceId));
      expect(updatedSource?.summary).toBeTruthy();
      expect(updatedSource?.authors.length).toBeGreaterThan(0);

      const sourceThemeMemberships = await dbClient.db
        .select()
        .from(sourcesThematicAreas)
        .where(eq(sourcesThematicAreas.sourceId, sourceId));
      expect(sourceThemeMemberships.length).toBeGreaterThan(0);

      const sourceTypeMemberships = await dbClient.db
        .select()
        .from(sourcesSourceTypes)
        .where(eq(sourcesSourceTypes.sourceId, sourceId));
      expect(sourceTypeMemberships.length).toBeGreaterThan(0);

      const sourcePurposeMemberships = await dbClient.db
        .select()
        .from(sourcesPurposes)
        .where(eq(sourcesPurposes.sourceId, sourceId));
      expect(sourcePurposeMemberships.length).toBeGreaterThan(0);

      const sourceAudienceMemberships = await dbClient.db
        .select()
        .from(sourcesTargetAudienceTypes)
        .where(eq(sourcesTargetAudienceTypes.sourceId, sourceId));
      expect(sourceAudienceMemberships.length).toBeGreaterThan(0);

      const sourceRoleMemberships = await dbClient.db
        .select()
        .from(sourcesRoleRelevances)
        .where(eq(sourcesRoleRelevances.sourceId, sourceId));
      expect(sourceRoleMemberships.length).toBeGreaterThan(0);

      // After PR 2: assert rec-side M2M memberships are populated.
      const recIds = recRows.map((r) => r.id);
      let totalRecThemeMemberships = 0;
      let totalRecPurposeMemberships = 0;
      let totalRecAudienceMemberships = 0;
      let totalRecLocationMemberships = 0;
      for (const recId of recIds) {
        totalRecThemeMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsThematicAreas)
            .where(eq(recommendationsThematicAreas.recommendationId, recId))
        ).length;
        totalRecPurposeMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsPurposes)
            .where(eq(recommendationsPurposes.recommendationId, recId))
        ).length;
        totalRecAudienceMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsTargetAudienceTypes)
            .where(eq(recommendationsTargetAudienceTypes.recommendationId, recId))
        ).length;
        totalRecLocationMemberships += (
          await dbClient.db
            .select()
            .from(recommendationsLocationScopes)
            .where(eq(recommendationsLocationScopes.recommendationId, recId))
        ).length;
      }
      expect(totalRecThemeMemberships).toBeGreaterThan(0);
      expect(totalRecPurposeMemberships).toBeGreaterThan(0);
      expect(totalRecAudienceMemberships).toBeGreaterThan(0);
      expect(totalRecLocationMemberships).toBeGreaterThan(0);
    },
    90_000,
  );

  it(
    'full pipeline: emits parse → extract → embed → ready phase events',
    async () => {
      const pdfBytes = await loadFixturePdf();

      // Subscribe on a dedicated connection BEFORE upload — LISTEN is
      // connection-scoped and we want every phase event captured without the
      // race of "enqueue → handler fires → we subscribe".
      //
      // Subscription pre-dates the sourceId, so we can't know the channel
      // name yet. Pattern: upload first to learn `sourceId`, then subscribe,
      // then wait. Between upload and subscribe pg-boss won't have started
      // work (poll cadence ~2s) so we miss nothing in practice; the
      // `phase: 'ready'` tail event is the assertion anchor regardless.
      const { sourceId } = await uploadSource(
        systemRepoCtx(),
        {
          filename: fixtureFile,
          contentType: 'application/pdf',
          bytes: pdfBytes,
          title: 'e2e stream',
        },
        { storage: providers.storage, queue },
      );

      const events: JobEvent[] = [];
      const subDb = createDb(pg.url);
      let readyResolve: (() => void) | null = null;
      const readyPromise = new Promise<void>((resolve) => {
        readyResolve = resolve;
      });
      const unsub = await subscribeJobEvents(subDb.sql, sourceId, (event) => {
        events.push(event);
        if (event.type === 'phase' && event.phase === 'ready') {
          readyResolve?.();
        }
      });

      try {
        await Promise.race([
          readyPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timed out waiting for phase=ready')), 60_000),
          ),
        ]);

        // Phase assertions: the order of the first occurrence of each phase
        // must be parsing → extracting → embedding → ready.
        const phaseEvents = events.filter((e): e is Extract<JobEvent, { type: 'phase' }> =>
          e.type === 'phase',
        );
        const firstIndexOf = (phase: string): number =>
          phaseEvents.findIndex((e) => e.phase === phase);

        const parsingAt = firstIndexOf('parsing');
        const extractingAt = firstIndexOf('extracting');
        const embeddingAt = firstIndexOf('embedding');
        const readyAt = firstIndexOf('ready');

        expect(parsingAt).toBeGreaterThanOrEqual(0);
        expect(extractingAt).toBeGreaterThan(parsingAt);
        expect(embeddingAt).toBeGreaterThan(extractingAt);
        expect(readyAt).toBeGreaterThan(embeddingAt);
      } finally {
        await unsub();
        await subDb.sql.end({ timeout: 5 });
      }
    },
    90_000,
  );
});
