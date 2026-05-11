import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Lazy: defer getAuth() until first request so the build succeeds in local
// mode (where BETTER_AUTH_SECRET / BETTER_AUTH_URL aren't required). Next.js
// still compiles this route in both modes, but the handler isn't invoked
// until a real request arrives.
async function handle(req: Request, method: 'GET' | 'POST'): Promise<Response> {
  const handlers = toNextJsHandler(getAuth());
  return method === 'GET' ? handlers.GET(req) : handlers.POST(req);
}

export const GET = (req: Request) => handle(req, 'GET');
export const POST = (req: Request) => handle(req, 'POST');
