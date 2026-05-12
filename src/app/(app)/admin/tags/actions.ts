'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import {
  TAXONOMY_AXES,
  deleteTag,
  mergeTag,
  promoteTag,
  renameTag,
  type TaxonomyAxis,
} from '@/lib/repositories/taxonomy';

const AxisSchema = z.enum(TAXONOMY_AXES);

const PromoteInput = z.object({ axis: AxisSchema, id: z.string().uuid() });
const RenameInput = z.object({
  axis: AxisSchema,
  id: z.string().uuid(),
  name: z.string().min(1).max(500),
});
const MergeInput = z.object({
  axis: AxisSchema,
  fromId: z.string().uuid(),
  toId: z.string().uuid(),
});
const DeleteInput = z.object({ axis: AxisSchema, id: z.string().uuid() });

type Result = { ok: true } | { ok: false; error: string };

async function buildContext(): Promise<{ ctx: RepoContext; close: () => Promise<void> }> {
  const env = loadEnv();
  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/admin/tags', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const client = createDb(env.DATABASE_URL);
  return {
    ctx: { db: client.db, auth },
    close: async () => {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

export async function promoteTagAction(input: unknown): Promise<Result> {
  const parsed = PromoteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await promoteTag(ctx, parsed.data.axis as TaxonomyAxis, parsed.data.id);
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}

export async function renameTagAction(input: unknown): Promise<Result> {
  const parsed = RenameInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await renameTag(ctx, parsed.data.axis as TaxonomyAxis, parsed.data.id, parsed.data.name);
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}

export async function mergeTagAction(input: unknown): Promise<Result> {
  const parsed = MergeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await mergeTag(
      ctx,
      parsed.data.axis as TaxonomyAxis,
      parsed.data.fromId,
      parsed.data.toId,
    );
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}

export async function deleteTagAction(input: unknown): Promise<Result> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await deleteTag(ctx, parsed.data.axis as TaxonomyAxis, parsed.data.id);
    revalidatePath('/admin/tags', 'page');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'failed' };
  } finally {
    await close();
  }
}
