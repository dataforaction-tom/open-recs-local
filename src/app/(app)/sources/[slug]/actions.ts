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
import type { RepoContext } from '@/lib/repositories/types';
import {
  RequestAccessInput,
  ResolveRequestInput,
} from '@/lib/validation/ownership-request';

export type OwnershipActionResult =
  | { ok: true }
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
    return { ok: true };
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
