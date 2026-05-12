'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { createProgressUpdate } from '@/lib/repositories/progress-update';
import { appendStatus } from '@/lib/repositories/recommendation-status';
import { updateRecommendationCore } from '@/lib/repositories/recommendation';
import type { RepoContext } from '@/lib/repositories/types';
import {
  ProgressUpdateInput,
  StatusTransitionInput,
} from '@/lib/validation/progress-update';
import {
  EditRecommendationInput,
  type EditRecommendationInputT,
} from '@/lib/validation/edit-recommendation';
import {
  resolveOrCreateLocationScopes,
  resolveOrCreatePriorityTimescales,
  resolveOrCreatePurposes,
  resolveOrCreateTargetAudienceTypes,
  resolveOrCreateThematicAreas,
} from '@/lib/repositories/taxonomy';
import {
  replaceRecommendationLocationScopes,
  replaceRecommendationPurposes,
  replaceRecommendationTargetAudienceTypes,
  replaceRecommendationThematicAreas,
} from '@/lib/repositories/recommendation-tags';

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; issues?: z.core.$ZodIssue[] };

async function buildContext(): Promise<{ ctx: RepoContext; close: () => Promise<void> }> {
  const env = loadEnv();
  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/recommendations', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const client = createDb(env.DATABASE_URL);
  const ctx: RepoContext = { db: client.db, auth };
  return {
    ctx,
    close: async () => {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

export async function postProgressUpdate(input: unknown): Promise<ActionResult> {
  const parsed = ProgressUpdateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation', issues: parsed.error.issues };
  }
  const { ctx, close } = await buildContext();
  try {
    const result = await createProgressUpdate(ctx, parsed.data);
    if (!result) return { ok: false, error: 'not_found' };
    revalidatePath(`/recommendations/${parsed.data.recommendationId}`);
    revalidatePath('/recommendations');
    return { ok: true };
  } finally {
    await close();
  }
}

export async function transitionStatus(input: unknown): Promise<ActionResult> {
  const parsed = StatusTransitionInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation', issues: parsed.error.issues };
  }
  const { ctx, close } = await buildContext();
  try {
    const result = await appendStatus(ctx, parsed.data);
    if (!result) return { ok: false, error: 'not_found' };
    revalidatePath(`/recommendations/${parsed.data.recommendationId}`);
    revalidatePath('/recommendations');
    return { ok: true };
  } finally {
    await close();
  }
}

export async function updateRecommendation(input: unknown): Promise<ActionResult> {
  const parsed = EditRecommendationInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation', issues: parsed.error.issues };
  }
  const data: EditRecommendationInputT = parsed.data;
  const { ctx, close } = await buildContext();
  try {
    const priorityIds = data.priority_timescale_slug
      ? await resolveOrCreatePriorityTimescales(ctx, [data.priority_timescale_slug])
      : [];

    await updateRecommendationCore(ctx, data.recommendationId, {
      title: data.title,
      body: data.body,
      targetOrganization: data.target_organization ?? null,
      priorityTimescaleId: priorityIds[0] ?? null,
      confidence: data.confidence ?? null,
      notes: data.notes ?? null,
      pageAnchor: data.page_start ?? null,
    });

    const themeIds = await resolveOrCreateThematicAreas(ctx, data.thematic_area_slugs);
    await replaceRecommendationThematicAreas(ctx, data.recommendationId, themeIds);
    const purposeIds = await resolveOrCreatePurposes(ctx, data.purpose_slugs);
    await replaceRecommendationPurposes(ctx, data.recommendationId, purposeIds);
    const audienceIds = await resolveOrCreateTargetAudienceTypes(
      ctx,
      data.target_audience_type_slugs,
    );
    await replaceRecommendationTargetAudienceTypes(ctx, data.recommendationId, audienceIds);
    const locationIds = await resolveOrCreateLocationScopes(ctx, data.location_scope_slugs);
    await replaceRecommendationLocationScopes(ctx, data.recommendationId, locationIds);

    revalidatePath(`/recommendations/${data.recommendationId}`);
    revalidatePath('/recommendations');
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'update failed';
    return { ok: false, error: message };
  } finally {
    await close();
  }
}
