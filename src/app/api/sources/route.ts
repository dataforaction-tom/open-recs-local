import { z } from 'zod';
import { createDb, type DbClient } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createQueue, type Queue } from '@/lib/jobs/queue';
import { createProviders } from '@/lib/providers';
import { uploadSource } from '@/lib/services/upload-source';
import type { RepoContext } from '@/lib/repositories/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cap the buffered upload size. We read the whole file into memory via
 * `arrayBuffer()`, so this guards the node process from OOM on a hostile or
 * accidental large PDF. 50 MiB covers realistic report PDFs with headroom;
 * anything bigger should use a streamed/signed-URL path we haven't built yet.
 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

/**
 * The OCR pipeline currently only understands PDFs. Reject other MIME types
 * loudly at the boundary rather than letting the worker fail deep in parse.
 */
const ALLOWED_MIME_TYPES = new Set(['application/pdf']);

const BodySchema = z.object({
  file: z.instanceof(File),
  title: z.string().min(1).optional(),
  is_private: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/**
 * Lazily constructed per-process queue. pg-boss holds its own pool, so
 * creating one per request would be wasteful. Next routes run in a
 * long-lived node server in our deployment (docker compose, `next start`),
 * so a leaked module-scoped queue is not a serverless cold-start concern.
 */
let queueSingleton: Queue | null = null;
let queuePromise: Promise<Queue> | null = null;
async function getQueue(connectionString: string): Promise<Queue> {
  if (queueSingleton) return queueSingleton;
  if (!queuePromise) {
    queuePromise = createQueue({ connectionString }).then((q) => {
      queueSingleton = q;
      return q;
    });
  }
  return queuePromise;
}

/**
 * Test seam: reset the module-level queue so a testcontainer run in one test
 * doesn't leak into the next. Not exported from a public entry point.
 */
export async function __resetQueueForTests(): Promise<void> {
  if (queueSingleton) {
    await queueSingleton.stop().catch(() => {});
  }
  queueSingleton = null;
  queuePromise = null;
}

function jsonError(status: number, error: string, detail?: unknown): Response {
  return new Response(JSON.stringify({ error, ...(detail !== undefined ? { detail } : {}) }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, 'invalid multipart body');
  }

  const parsed = BodySchema.safeParse({
    file: form.get('file'),
    title: form.get('title') ?? undefined,
    is_private: form.get('is_private') ?? undefined,
  });
  if (!parsed.success) {
    return jsonError(400, 'invalid request', parsed.error.issues);
  }
  const { file, title, is_private } = parsed.data;

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError(413, `file exceeds ${MAX_UPLOAD_BYTES} byte cap`);
  }

  // File.type can be empty on some clients; treat empty as unknown and reject.
  const contentType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME_TYPES.has(contentType)) {
    return jsonError(415, `unsupported content-type: ${contentType}`);
  }

  const env = loadEnv();
  const providers = createProviders(env);

  // Per-request db; the pool lifetime is tied to this handler. We end it
  // in `finally` to avoid leaking sockets across request boundaries.
  let client: DbClient | undefined;
  try {
    client = createDb(env.DATABASE_URL);
    const queue = await getQueue(env.DATABASE_URL);
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    const bytes = Buffer.from(await file.arrayBuffer());
    const serviceInput: Parameters<typeof uploadSource>[1] = {
      filename: file.name,
      contentType,
      bytes,
    };
    if (title !== undefined) serviceInput.title = title;
    if (is_private !== undefined) serviceInput.isPrivate = is_private;
    // Stamp the owner so hosted-mode listing/visibility filters can find
    // the source from this user. Local mode uses the `system` context
    // (isSystem=true, non-UUID id) and stays public-anonymous.
    if (!auth.isSystem && auth.user?.id) {
      serviceInput.ownerUserId = auth.user.id;
    }

    const result = await uploadSource(ctx, serviceInput, { storage: providers.storage, queue });

    return new Response(
      JSON.stringify({ sourceId: result.sourceId, jobId: result.jobId, status: 'queued' }),
      { status: 201, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(500, 'upload failed', message);
  } finally {
    await client?.sql.end({ timeout: 5 }).catch(() => {});
  }
}
