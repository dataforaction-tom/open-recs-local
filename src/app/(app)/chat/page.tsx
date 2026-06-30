import { headers } from 'next/headers';
import { getSharedDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { getProviders } from '@/lib/providers/config';
import { listRecentSources } from '@/lib/repositories/jobs-list';
import type { RepoContext } from '@/lib/repositories/types';
import { ChatView } from '@/components/chat/chat-view';

export const dynamic = 'force-dynamic';

export default async function ChatPage() {
  const env = loadEnv();
  const { db } = await getSharedDb(env.DATABASE_URL);
  const providers = await getProviders(db, env);

  const headersList = await headers();
  const req = new Request('http://localhost/chat', { headers: headersList });
  const auth = await providers.auth.getContext(req);
  const ctx: RepoContext = { db, auth };

  const recentSources = await listRecentSources(ctx, { limit: 1 });
  const hasSources = recentSources.length > 0;

  return (
    <div className="space-y-12">
      <header className="space-y-3">
        <div className="section-num">07 · Chat</div>
        <h1 className="text-4xl tracking-tight">Ask the corpus a question</h1>
        <p className="max-w-[42rem] font-serif text-lg italic leading-relaxed text-foreground/85">
          The assistant answers strictly from passages it can cite. If the
          documents don’t cover something, it will say so plainly rather than
          improvise.
        </p>
      </header>

      <ChatView hasSources={hasSources} />
    </div>
  );
}
