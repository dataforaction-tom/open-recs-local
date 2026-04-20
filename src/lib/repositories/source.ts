import { eq } from 'drizzle-orm';
import { sources } from '../db/schema';
import { AuthorizationError, type RepoContext } from './types';

type SourceRow = {
  id: string;
  slug: string;
  title: string;
  isPrivate: boolean;
  ownerUserId: string | null;
};

function canWrite(ctx: RepoContext): boolean {
  if (ctx.auth.isSystem) return true;
  return ctx.auth.roles.includes('admin') || ctx.auth.roles.includes('editor');
}

function canRead(ctx: RepoContext, row: SourceRow): boolean {
  if (!row.isPrivate) return true;
  if (ctx.auth.isSystem) return true;
  return row.ownerUserId !== null && ctx.auth.user.id === row.ownerUserId;
}

export async function createSource(
  ctx: RepoContext,
  input: { slug: string; title: string; isPrivate?: boolean; ownerUserId?: string | null },
): Promise<{ id: string; slug: string }> {
  if (!canWrite(ctx)) throw new AuthorizationError('cannot create source');
  // exactOptionalPropertyTypes: only copy optional props when defined
  const values: {
    slug: string;
    title: string;
    isPrivate?: boolean;
    ownerUserId?: string | null;
  } = { slug: input.slug, title: input.title };
  if (input.isPrivate !== undefined) values.isPrivate = input.isPrivate;
  if (input.ownerUserId !== undefined) values.ownerUserId = input.ownerUserId;
  const [inserted] = await ctx.db
    .insert(sources)
    .values(values)
    .returning({ id: sources.id, slug: sources.slug });
  if (!inserted) throw new Error('createSource: no row returned');
  return inserted;
}

export async function findSourceBySlug(
  ctx: RepoContext,
  slug: string,
): Promise<SourceRow | null> {
  const rows = await ctx.db
    .select({
      id: sources.id,
      slug: sources.slug,
      title: sources.title,
      isPrivate: sources.isPrivate,
      ownerUserId: sources.ownerUserId,
    })
    .from(sources)
    .where(eq(sources.slug, slug))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return canRead(ctx, row) ? row : null;
}
