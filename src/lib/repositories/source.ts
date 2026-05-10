import { eq } from 'drizzle-orm';
import { sourceFiles, sources } from '../db/schema';
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

/**
 * Insert a `source_files` row. Pipelines use this for the `original` upload
 * plus any derived assets (page images, extracted attachments). Write access
 * is the same as `createSource` — anyone who can create the parent can
 * attach files to it.
 */
export async function createSourceFile(
  ctx: RepoContext,
  input: {
    sourceId: string;
    role: 'original' | 'page-image' | 'extracted-asset';
    storageKey: string;
    mimeType: string;
    bytes: number;
  },
): Promise<{ id: string }> {
  if (!canWrite(ctx)) throw new AuthorizationError('cannot create source file');
  const [inserted] = await ctx.db
    .insert(sourceFiles)
    .values(input)
    .returning({ id: sourceFiles.id });
  if (!inserted) throw new Error('createSourceFile: no row returned');
  return inserted;
}

export type SourceFileLookup = {
  storageKey: string;
  mimeType: string;
  sourceId: string;
  role: 'original' | 'page-image' | 'extracted-asset';
};

/**
 * Look up a `source_files` row by its storage key, returning null if no row
 * matches OR the joined source isn't visible to the viewer. The signed-URL
 * route relies on this for ownership gating — the HMAC token only proves the
 * key was minted by us, not that the current viewer can see it.
 */
export async function findSourceFileByKey(
  ctx: RepoContext,
  storageKey: string,
): Promise<SourceFileLookup | null> {
  const rows = await ctx.db
    .select({
      storageKey: sourceFiles.storageKey,
      mimeType: sourceFiles.mimeType,
      sourceId: sourceFiles.sourceId,
      role: sourceFiles.role,
      isPrivate: sources.isPrivate,
      ownerUserId: sources.ownerUserId,
      slug: sources.slug,
      title: sources.title,
      sourceIdJoin: sources.id,
    })
    .from(sourceFiles)
    .innerJoin(sources, eq(sources.id, sourceFiles.sourceId))
    .where(eq(sourceFiles.storageKey, storageKey))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const sourceRow: SourceRow = {
    id: row.sourceIdJoin,
    slug: row.slug,
    title: row.title,
    isPrivate: row.isPrivate,
    ownerUserId: row.ownerUserId,
  };
  if (!canRead(ctx, sourceRow)) return null;

  return {
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    sourceId: row.sourceId,
    role: row.role,
  };
}

