import { randomUUID } from 'node:crypto';
import type { Queue } from '../jobs/queue';
import type { StorageProvider } from '../providers/storage/types';
import { createSource, createSourceFile } from '../repositories/source';
import type { RepoContext } from '../repositories/types';

export type UploadSourceInput = {
  filename: string;
  contentType: string;
  bytes: Buffer;
  title?: string;
  isPrivate?: boolean;
  ownerUserId?: string | null;
};

export type UploadSourceDeps = {
  storage: StorageProvider;
  queue: Queue;
};

export type UploadSourceResult = {
  sourceId: string;
  jobId: string;
};

/**
 * Slugify a filename: lowercase, drop extension, keep alnum + dashes,
 * collapse runs. Paired with a short random suffix in the service so two
 * uploads of `report.pdf` don't collide on the `sources.slug` unique index.
 */
function slugifyFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').toLowerCase();
  const cleaned = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : 'source';
}

/**
 * Handle a source upload end-to-end: insert the `sources` row, write the
 * file bytes to storage, record a `source_files` row, enqueue `source.parse`.
 *
 * Ordering rationale: the `sources` row is inserted first so we have a
 * stable `sourceId` to key the storage path and the `source_files.source_id`
 * FK. Storage is written before the `source_files` row so a failure there
 * leaves no dangling DB reference to a missing blob. If storage succeeds but
 * the `source_files` insert or enqueue fails, the orphaned blob is tolerable
 * for a local-first app; a future cleanup job can reconcile by storage key.
 *
 * Transactional scope intentionally excludes storage — we cannot roll back
 * a storage `put`, so we sequence instead of wrapping.
 */
export async function uploadSource(
  ctx: RepoContext,
  input: UploadSourceInput,
  deps: UploadSourceDeps,
): Promise<UploadSourceResult> {
  const slug = `${slugifyFilename(input.filename)}-${randomUUID().slice(0, 8)}`;
  const title = input.title ?? input.filename;

  const createInput: Parameters<typeof createSource>[1] = { slug, title };
  if (input.isPrivate !== undefined) createInput.isPrivate = input.isPrivate;
  if (input.ownerUserId !== undefined) createInput.ownerUserId = input.ownerUserId;
  const { id: sourceId } = await createSource(ctx, createInput);

  const storageKey = `sources/${sourceId}/${input.filename}`;
  await deps.storage.put(storageKey, input.bytes, { contentType: input.contentType });

  await createSourceFile(ctx, {
    sourceId,
    role: 'original',
    storageKey,
    mimeType: input.contentType,
    bytes: input.bytes.length,
  });

  const jobId = await deps.queue.enqueue('source.parse', { sourceId });

  return { sourceId, jobId };
}
