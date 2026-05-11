'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import {
  approveOwnershipRequest,
  rejectOwnershipRequest,
} from '@/lib/repositories/ownership-request';
import { LastAdminError, setUserRole } from '@/lib/repositories/user-role';
import type { RepoContext } from '@/lib/repositories/types';
import { ROLES } from '@/lib/db/schema';
import { ResolveRequestInput } from '@/lib/validation/ownership-request';

export type AdminActionResult = { ok: true } | { ok: false; error: string };

const SetRoleInput = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

async function buildContext(): Promise<{ ctx: RepoContext; close: () => Promise<void> }> {
  const env = loadEnv();
  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/admin', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const client = createDb(env.DATABASE_URL);
  return {
    ctx: { db: client.db, auth },
    close: async () => {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

export async function approveRequest(input: unknown): Promise<AdminActionResult> {
  const parsed = ResolveRequestInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    const result = await approveOwnershipRequest(ctx, parsed.data.id);
    if (!result.ok) return { ok: false, error: result.error };
    revalidatePath('/admin', 'page');
    return { ok: true };
  } finally {
    await close();
  }
}

export async function rejectRequest(input: unknown): Promise<AdminActionResult> {
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

export async function changeUserRole(input: unknown): Promise<AdminActionResult> {
  const parsed = SetRoleInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'validation' };
  const { ctx, close } = await buildContext();
  try {
    await setUserRole(ctx, parsed.data.userId, parsed.data.role);
    revalidatePath('/admin', 'page');
    return { ok: true };
  } catch (err) {
    if (err instanceof LastAdminError) return { ok: false, error: 'last_admin' };
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  } finally {
    await close();
  }
}
