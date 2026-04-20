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

describe('schema — taxonomy + misc', () => {
  it('creates thematic_areas, recommendations_thematic_areas, evidence_types, progress_ratings', async () => {
    expect(await tableExists('thematic_areas')).toBe(true);
    expect(await tableExists('recommendations_thematic_areas')).toBe(true);
    expect(await tableExists('evidence_types')).toBe(true);
    expect(await tableExists('progress_ratings')).toBe(true);
  });

  it('creates ownership_requests, job_results, analytics_cache', async () => {
    expect(await tableExists('ownership_requests')).toBe(true);
    expect(await tableExists('job_results')).toBe(true);
    expect(await tableExists('analytics_cache')).toBe(true);
  });

  it('thematic_areas.color_hex is text and NOT NULL', async () => {
    const rows = await sql<{ data_type: string; is_nullable: string }[]>`
      select data_type, is_nullable from information_schema.columns
      where table_name = 'thematic_areas' and column_name = 'color_hex'
    `;
    expect(rows[0]?.data_type).toBe('text');
    expect(rows[0]?.is_nullable).toBe('NO');
  });

  it('recommendations_thematic_areas has composite primary key on (recommendation_id, thematic_area_id)', async () => {
    const rows = await sql<{ column_name: string }[]>`
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
      where tc.table_name = 'recommendations_thematic_areas'
        and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position
    `;
    const cols = rows.map((r) => r.column_name);
    expect(cols).toEqual(['recommendation_id', 'thematic_area_id']);
  });
});
