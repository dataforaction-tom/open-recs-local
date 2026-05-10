import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { verifyFileToken } from '@/lib/files/sign';
import { createProviders } from '@/lib/providers';
import { findSourceFileByKey } from '@/lib/repositories/source';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type RouteContext = { params: Promise<{ token: string }> };

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function GET(req: Request, ctx: RouteContext): Promise<Response> {
  const { token } = await ctx.params;

  const env = loadEnv();
  const verified = verifyFileToken(env.FILE_TOKEN_SECRET, token ?? '');
  if (!verified) return jsonError(401, 'invalid or expired token');

  const providers = createProviders(env);
  let client: DbClient | undefined;
  try {
    client = createDb(env.DATABASE_URL);
    const auth = await providers.auth.getContext(req);
    const repoCtx: RepoContext = { db: client.db, auth };

    const file = await findSourceFileByKey(repoCtx, verified.key);
    if (!file) return jsonError(404, 'not found');

    const bytes = await providers.storage.get(file.storageKey);
    return new Response(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': file.mimeType,
        'cache-control': 'private, max-age=300',
        'content-length': String(bytes.length),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, message);
  } finally {
    await client?.sql.end({ timeout: 5 }).catch(() => {});
  }
}
