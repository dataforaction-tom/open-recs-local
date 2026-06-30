import { streamText } from 'ai';
import { z } from 'zod';
import { getSharedDb, type DbClient } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { getProviders } from '@/lib/providers/config';
import { getChatModel } from '@/lib/providers/llm/chat-model';
import type { RepoContext } from '@/lib/repositories/types';
import { searchSourcePages } from '@/lib/services/search';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const BodySchema = z.object({
  q: z.string().min(2).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .optional(),
});

const SYSTEM_PROMPT_HEADER =
  'You are an assistant answering questions strictly from the supplied passages.\n' +
  'When you state a fact taken from a passage, append the exact citation marker [[source:<slug>#page:<n>]] for that passage.\n' +
  'If the passages do not contain the answer, say so plainly. Do not invent citations.\n\n' +
  'Passages:\n';

function jsonError(status: number, error: string, detail?: unknown): Response {
  return new Response(JSON.stringify({ error, ...(detail !== undefined ? { detail } : {}) }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonError(415, 'expected application/json');
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return jsonError(400, 'invalid JSON body');
  }
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) {
    return jsonError(400, 'invalid request', parsed.error.issues);
  }
  const { q, history = [] } = parsed.data;

  const env = loadEnv();
  const model = getChatModel(env);
  if (!model) {
    return jsonError(503, 'no streaming chat model configured');
  }

  let client: DbClient | undefined;
  try {
    client = await getSharedDb(env.DATABASE_URL);
    // DB-aware provider resolution so saved provider settings take effect on the
    // web read path too (cached in-process by getProviders).
    const providers = await getProviders(client.db, env);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const retrieved = await searchSourcePages(
      { ctx, q, topK: 8 },
      { embedding: providers.embedding },
    );

    // All DB work is done — the streaming phase below is LLM-only. The
    // shared pool stays open; it's managed at the process level.
    client = undefined;

    const passages = retrieved
      .map((p) => `[source:${p.sourceSlug} page:${p.pageNumber}]\n${p.markdown}`)
      .join('\n\n');
    const system = SYSTEM_PROMPT_HEADER + (passages || '(no passages retrieved)');

    const messages = [
      ...history.map((h) => ({ role: h.role, content: h.content })),
      { role: 'user' as const, content: q },
    ];

    const retrievedHeader = JSON.stringify(
      retrieved.map((p) => ({ slug: p.sourceSlug, page: p.pageNumber })),
    );

    const result = streamText({ model, system, messages });
    return result.toTextStreamResponse({
      headers: {
        'x-citations-count': String(retrieved.length),
        'x-retrieved': retrievedHeader,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, 'chat-search failed', message);
  }
  // No finally — the shared pool is not closed per-request.
}
