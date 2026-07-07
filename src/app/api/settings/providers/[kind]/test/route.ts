import { z } from 'zod';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { createDb, getSharedDb, type DbClient } from '@/lib/db/client';
import { listProviderSettings } from '@/lib/repositories/provider-settings';
import { decryptSecret } from '@/lib/security/secrets';
import { PROVIDER_KINDS, type ProviderKind } from '@/lib/db/schema';
import type { RepoContext } from '@/lib/repositories/types';
import { testProviderConnection } from '@/lib/providers/test-connection';

const BodySchema = z.object({
  provider: z.string().min(1).max(200),
  baseUrl: z.string().max(500).optional().default(''),
  model: z.string().max(200).optional().default(''),
  apiKey: z.string().optional().default(''),
});

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Live round-trip test for a provider configuration. Accepts the submitted
 * (pre-save) config in the body, tests the connection without persisting, and
 * returns `{ ok, kind, dimension?, error? }`.
 *
 * When `apiKey` is blank, the route falls back to the stored decrypted key for
 * that kind so Test works without re-typing an existing secret.
 *
 * Admin-gated via AuthContext. In local mode the auth context resolves to
 * system (admin); in hosted mode the admin role is required.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind: kindParam } = await params;
  if (!PROVIDER_KINDS.includes(kindParam as ProviderKind)) {
    return json(400, { error: `invalid kind: ${kindParam}` });
  }
  const kind = kindParam as ProviderKind;

  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json(415, { error: 'content-type must be application/json' });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'invalid JSON body' });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json(400, { error: 'validation', details: parsed.error.issues });
  }
  const { provider, baseUrl, model, apiKey } = parsed.data;

  const env = loadEnv();

  // Auth — admin gate. In local mode, auth resolves to system (admin).
  let client: DbClient | undefined;
  try {
    client = env.APP_MODE === 'local' ? createDb(env.DATABASE_URL) : await getSharedDb(env.DATABASE_URL);
    const providers = createProviders(env);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };
    if (!ctx.auth.isSystem && !ctx.auth.roles.includes('admin')) {
      return json(403, { error: 'admin access required' });
    }

    // Fall back to the stored decrypted key when the submitted key is blank.
    let effectiveKey = apiKey;
    if (!effectiveKey) {
      const rows = await listProviderSettings(ctx.db);
      const stored = rows.find((r) => r.kind === kind);
      if (stored?.apiKeyEncrypted) {
        effectiveKey = decryptSecret(env.PROVIDER_SECRET_KEY, stored.apiKeyEncrypted);
      }
    }

    const result = await testProviderConnection({ kind, provider, baseUrl, model, apiKey: effectiveKey });
    return json(200, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { ok: false, kind, error: message });
  } finally {
    // In local mode we created the client directly; close it. In hosted mode
    // getSharedDb manages a pool that should not be closed per-request.
    if (client && env.APP_MODE === 'local') {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    }
  }
}