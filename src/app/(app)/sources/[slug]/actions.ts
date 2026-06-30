'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  approveOwnershipRequest,
  createOwnershipRequest,
  rejectOwnershipRequest,
  withdrawOwnershipRequest,
} from '@/lib/repositories/ownership-request';
import { updateSourceMetadata } from '@/lib/repositories/source';
import type { RepoContext } from '@/lib/repositories/types';
import {
  RequestAccessInput,
  ResolveRequestInput,
} from '@/lib/validation/ownership-request';
import { EditSourceInput, type EditSourceInputT } from '@/lib/validation/edit-source';
import {
  resolveOrCreatePurposes,
  resolveOrCreateRoleRelevances,
  resolveOrCreateSourceTypes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  replaceSourcePurposes,
  replaceSourceRoleRelevances,
  replaceSourceSourceTypes,
  replaceSourceTargetAudienceTypes,
  replaceSourceThematicAreas,
} from '@/lib/repositories/source-tags';

export type OwnershipActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

async function buildContext(): Promise<{ ctx: RepoContext; close: () => Promise<void> }> {
  const env = loadEnv();
  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/sources', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const client = createDb(env.DATABASE_URL);
  return {
    ctx: { db: client.db, auth },
    close: async () => {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

export async function requestSourceAccess(input: unknown): Promise<OwnershipActionResult> {
  const parsed = RequestAccessInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    const result = await createOwnershipRequest(ctx, parsed.data);
    if ('error' in result) return { ok: false, error: result.error };
    revalidatePath('/sources', 'page');
    revalidatePath('/admin', 'page');
    return { ok: true, id: result.id };
  } finally {
    await close();
  }
}

export async function withdrawSourceAccessRequest(
  input: unknown,
): Promise<OwnershipActionResult> {
  const parsed = ResolveRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    const result = await withdrawOwnershipRequest(ctx, parsed.data.id);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/sources', 'page');
    revalidatePath('/admin', 'page');
    return { ok: true };
  } finally {
    await close();
  }
}

export async function approveSourceAccessRequest(
  input: unknown,
): Promise<OwnershipActionResult> {
  const parsed = ResolveRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    const result = await approveOwnershipRequest(ctx, parsed.data.id);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/sources', 'page');
    revalidatePath('/admin', 'page');
    return { ok: true };
  } finally {
    await close();
  }
}

export async function rejectSourceAccessRequest(
  input: unknown,
): Promise<OwnershipActionResult> {
  const parsed = ResolveRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    const result = await rejectOwnershipRequest(ctx, parsed.data.id);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/admin', 'page');
    return { ok: true };
  } finally {
    await close();
  }
}

function parsePublicationDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function updateSource(input: unknown): Promise<OwnershipActionResult> {
  const parsed = EditSourceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const data: EditSourceInputT = parsed.data;
  const { ctx, close } = await buildContext();
  try {
    if (!ctx.auth.isSystem && !ctx.auth.roles.includes('admin') && !ctx.auth.roles.includes('editor')) {
      return { ok: false, error: 'unauthorized' };
    }
    await updateSourceMetadata(ctx, data.sourceId, {
      title: data.title,
      summary: data.summary ?? null,
      authors: data.authors,
      publicationDate: parsePublicationDate(data.publication_date ?? null),
      orgOwner: data.org_owner ?? null,
      originalUrl: data.original_url ?? null,
      attachmentUrl: data.attachment_url ?? null,
      datasets: data.datasets,
      ...(data.is_private !== undefined ? { isPrivate: data.is_private } : {}),
    });

    const themeIds = await resolveOrCreateThematicAreas(ctx, data.thematic_area_slugs);
    await replaceSourceThematicAreas(ctx, data.sourceId, themeIds);
    const typeIds = await resolveOrCreateSourceTypes(ctx, data.source_type_slugs);
    await replaceSourceSourceTypes(ctx, data.sourceId, typeIds);
    const purposeIds = await resolveOrCreatePurposes(ctx, data.purpose_slugs);
    await replaceSourcePurposes(ctx, data.sourceId, purposeIds);
    const roleIds = await resolveOrCreateRoleRelevances(ctx, data.role_relevance_slugs);
    await replaceSourceRoleRelevances(ctx, data.sourceId, roleIds);
    const audienceIds = await resolveOrCreateTargetAudienceTypes(
      ctx,
      data.target_audience_type_slugs,
    );
    await replaceSourceTargetAudienceTypes(ctx, data.sourceId, audienceIds);

    revalidatePath('/sources', 'page');
    revalidatePath(`/sources/[slug]`, 'page');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    return { ok: false, error: message };
  } finally {
    await close();
  }
}
