'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { createProgressUpdate } from '@/lib/repositories/progress-update';
import { appendStatus } from '@/lib/repositories/recommendation-status';
import type { RepoContext } from '@/lib/repositories/types';
import {
  ProgressUpdateInput,
  StatusTransitionInput,
} from '@/lib/validation/progress-update';

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
