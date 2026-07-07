import { z } from 'zod';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { createDb, getSharedDb, type DbClient } from '@/lib/db/client';
import { listProviderSettings } from '@/lib/repositories/provider-settings';
import { decryptSecret } from '@/lib/security/secrets';
import { PROVIDER_KINDS, type ProviderKind } from '@/lib/db/schema';
import type { RepoContext } from '@/lib/repositories/types';
import { listModels } from '@/lib/providers/llm/discover';

const QuerySchema = z.object({
  baseUrl: z.string().max(500).optional(),
  apiKey: z.string().optional(),
});

// Kinds whose underlying servers speak the OpenAI-compatible `/v1/models`
// contract — i.e. a `{ data: [{ id }] }` listing of model identifiers. LLM and
// chat both ride the same OpenAI-compatible adapter; embedding servers
// (Ollama, OpenAI) expose the same endpoint. OCR providers (docling, mistral)
// do not have a unified "list models" surface that fits this shape, so model
// discovery is not offered for that kind.
const DISCOVERABLE_KINDS: ReadonlySet<ProviderKind> = new Set<ProviderKind>([
  'llm',
  'chat',
  'embedding',
]);

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * GET /api/settings/providers/[kind]/models
 *
 * Generalised model discovery: proxies the provider server's
 * OpenAI-compatible `/v1/models` endpoint for the given `kind`
 * (`llm` | `chat` | `embedding`). Used by the admin provider form to populate
 * the model picker *before* the config is saved — `baseUrl` and `apiKey` come
 * from the query string so the UI can probe a candidate configuration.
 *
 * When `baseUrl` is omitted, the route falls back to the stored config for that
 * `kind` (so Test-after-save flows still work). When `apiKey` is blank, the
 * stored decrypted key is used.
 *
 * `ocr` returns 400 — model discovery is not applicable for that kind.
 *
 * Admin-gated via AuthContext: in local mode the auth context resolves to
 * system (admin); in hosted mode the admin role is required.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const { kind: kindParam } = await params;
  if (!PROVIDER_KINDS.includes(kindParam as ProviderKind)) {
    return json(400, { error: `invalid kind: ${kindParam}` });
  }
  const kind = kindParam as ProviderKind;
  if (!DISCOVERABLE_KINDS.has(kind)) {
    return json(400, { error: `model discovery is not supported for kind: ${kind}` });
  }

  const url = new URL(req.url);
  const queryParse = QuerySchema.safeParse({
    baseUrl: url.searchParams.get('baseUrl') ?? undefined,
    apiKey: url.searchParams.get('apiKey') ?? undefined,
  });
  if (!queryParse.success) {
    return json(400, { error: 'validation', details: queryParse.error.issues });
  }
  const { baseUrl: queryBaseUrl, apiKey: queryApiKey } = queryParse.data;

  const env = loadEnv();

  // Auth — admin gate. In local mode, auth resolves to system (admin).
  let client: DbClient | undefined;
  try {
    client =
      env.APP_MODE === 'local' ? createDb(env.DATABASE_URL) : await getSharedDb(env.DATABASE_URL);
    const providers = createProviders(env);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };
    if (!ctx.auth.isSystem && !ctx.auth.roles.includes('admin')) {
      return json(403, { error: 'admin access required' });
    }

    // Resolve effective baseUrl + apiKey. Query params win; blanks fall back to
    // the stored config for this kind so a saved row can still be probed.
    let effectiveBaseUrl = queryBaseUrl?.trim() ?? '';
    let effectiveApiKey = queryApiKey?.trim() ?? '';
    if (!effectiveBaseUrl || !effectiveApiKey) {
      const rows = await listProviderSettings(ctx.db);
      const stored = rows.find((r) => r.kind === kind);
      if (!effectiveBaseUrl) effectiveBaseUrl = stored?.baseUrl?.trim() ?? '';
      if (!effectiveApiKey && stored?.apiKeyEncrypted) {
        effectiveApiKey = decryptSecret(env.PROVIDER_SECRET_KEY, stored.apiKeyEncrypted);
      }
    }

    if (!effectiveBaseUrl) {
      return json(400, { error: 'baseUrl is required (provide it as a query param or save a provider config first)' });
    }

    try {
      const models = await listModels(
        effectiveBaseUrl,
        effectiveApiKey || undefined,
      );
      return json(200, { kind, baseUrl: effectiveBaseUrl, models });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(502, { error: `failed to reach models endpoint: ${message}` });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json(500, { error: message });
  } finally {
    // In local mode we created the client directly; close it. In hosted mode
    // getSharedDb manages a pool that should not be closed per-request.
    if (client && env.APP_MODE === 'local') {
      await client.sql.end({ timeout: 5 }).catch(() => {});
    }
  }
}