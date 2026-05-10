import { sql } from 'drizzle-orm';
import type { RepoContext } from './types';

export type RecentJob = {
  id: string;
  name: string;
  state: string;
  createdOn: Date;
  completedOn: Date | null;
};

type RawRow = {
  id: string;
  name: string;
  state: string;
  createdOn: Date | string;
  completedOn: Date | string | null;
};

/**
 * Reads pg-boss's own job table to surface recent activity on the dashboard.
 * Couples us to pg-boss's schema (currently v12: pgboss.job columns are
 * id, name, state, created_on, completed_on). Pin pg-boss in package.json
 * — a major bump may rename columns and need an update here.
 *
 * Phase 8 will extend this to intersect with sources the viewer can see.
 */
export async function listRecentJobs(
  _ctx: RepoContext,
  args: { limit?: number } = {},
): Promise<RecentJob[]> {
  const limit = args.limit ?? 20;
  const rows = await _ctx.db.execute<RawRow>(sql`
    SELECT
      id::text     AS "id",
      name         AS "name",
      state        AS "state",
      created_on   AS "createdOn",
      completed_on AS "completedOn"
    FROM pgboss.job
    ORDER BY created_on DESC
    LIMIT ${limit}
  `);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    state: row.state,
    createdOn: row.createdOn instanceof Date ? row.createdOn : new Date(row.createdOn),
    completedOn:
      row.completedOn === null
        ? null
        : row.completedOn instanceof Date
          ? row.completedOn
          : new Date(row.completedOn),
  }));
}
