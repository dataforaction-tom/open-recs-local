'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { AuthorizationError, type RepoContext } from '@/lib/repositories/types';
import {
  listProviderSettings,
  upsertProviderSetting,
} from '@/lib/repositories/provider-settings';
import { PROVIDER_KINDS, type ProviderKind } from '@/lib/db/schema';
import { encryptSecret } from '@/lib/security/secrets';

const SaveInput = z.object({
  kind: z.enum(PROVIDER_KINDS),
  provider: z.string().min(1).max(200),
  baseUrl: z.string().url().or(z.literal('')).optional(),
  model: z.string().max(200).optional(),
  apiKey: z.string().optional(),
});

async function buildContext(): Promise<{ ctx: RepoContext; close: () => Promise<void> }> {
  const env = loadEnv();
  const providers = createProviders(env);
  const headersList = await headers();
  const req = new Request('http://localhost/admin/providers', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const client = createDb(env.DATABASE_URL);
  const ctx: RepoContext = { db: client.db, auth };
  if (!ctx.auth.isSystem && !ctx.auth.roles.includes('admin')) {
    throw new AuthorizationError('admin access required');
  }
  return {
    ctx,
    close: async () => {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    },
  };
}

/**
 * Form action bound to each per-kind <form>. Reads FormData, validates, encrypts
 * the API key (blank = keep existing ciphertext), and upserts the row. Throws on
 * validation / auth / DB errors so Next.js surfaces them as the action result.
 */
export async function saveProviderSettings(formData: FormData): Promise<void> {
  const parsed = SaveInput.safeParse({
    kind: formData.get('kind'),
    provider: formData.get('provider'),
    baseUrl: formData.get('baseUrl'),
    model: formData.get('model'),
    apiKey: formData.get('apiKey'),
  });
  if (!parsed.success) throw new Error('validation');
  const env = loadEnv();
  const { ctx, close } = await buildContext();
  try {
    const data = parsed.data;
    const kind = data.kind as ProviderKind;
    const baseUrl = data.baseUrl?.trim() ? data.baseUrl.trim() : null;
    const model = data.model?.trim() ? data.model.trim() : null;
    const apiKeyTrimmed = data.apiKey?.trim() ?? '';
    // Empty apiKey means "leave unchanged"; we re-encrypt only when a value is
    // submitted. A blank submission preserves the existing ciphertext by
    // reloading it first.
    let apiKeyEncrypted: string | null = null;
    if (apiKeyTrimmed) {
      apiKeyEncrypted = encryptSecret(env.PROVIDER_SECRET_KEY, apiKeyTrimmed);
    } else {
      const existing = (await listProviderSettings(ctx.db)).find((r) => r.kind === kind);
      apiKeyEncrypted = existing?.apiKeyEncrypted ?? null;
    }
    await upsertProviderSetting(ctx.db, {
      kind,
      provider: data.provider.trim(),
      baseUrl,
      model,
      apiKeyEncrypted,
      extra: {},
      updatedBy: ctx.auth.user.id,
    });
    revalidatePath('/admin/providers', 'page');
  } finally {
    await close();
  }
}