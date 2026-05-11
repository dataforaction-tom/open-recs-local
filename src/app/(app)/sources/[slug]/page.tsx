import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { signFileToken } from '@/lib/files/sign';
import { createProviders } from '@/lib/providers';
import { describeSourceAccess } from '@/lib/repositories/ownership-request';
import { getSourceWithPagesBySlug } from '@/lib/repositories/source';
import { NotFoundError } from '@/lib/repositories/types';
import type { RepoContext } from '@/lib/repositories/types';
import { SourceViewer } from '@/components/source-viewer/source-viewer';
import { RequestAccessForm } from '@/components/sources/request-access-form';
import type { SourcePage } from '@/components/source-viewer/source-markdown';
import {
  requestSourceAccess,
  withdrawSourceAccessRequest,
} from './actions';

export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

export default async function SourceDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const env = loadEnv();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request(`http://localhost/sources/${slug}`, { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    // Inspect the slug's visibility first. In local mode the source is always
    // visible to the system context; in hosted mode it may be private to
    // another user. Branching here avoids leaking existence via the 404
    // semantics of the public-only loader.
    const access = await describeSourceAccess(ctx, slug);
    if (access.kind === 'not-found') notFound();

    if (access.kind === 'private') {
      // Anonymous viewers: don't expose request-access UI. Treat as not-found
      // so the existence isn't leaked to non-signed-in visitors.
      if (!ctx.auth.user.email) notFound();
      return (
        <RequestAccessForm
          sourceId={access.sourceId}
          sourceTitle={access.title}
          pendingRequestId={access.pendingRequestId}
          action={requestSourceAccess}
          withdrawAction={withdrawSourceAccessRequest}
        />
      );
    }

    let data;
    try {
      data = await getSourceWithPagesBySlug(ctx, slug);
    } catch (err) {
      if (err instanceof NotFoundError) notFound();
      throw err;
    }

    if (!data.originalPdfKey) {
      return (
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{data.source.title}</h1>
          <p className="text-muted-foreground">This source is still being processed. Check back shortly.</p>
        </div>
      );
    }

    const pdfToken = signFileToken(env.FILE_TOKEN_SECRET, { key: data.originalPdfKey });
    const pdfUrl = `/api/files/${pdfToken}`;

    const pages: SourcePage[] = data.pages.map((p) => {
      const imageUrls: Record<string, string> = {};
      for (const ref of p.imageRefs) {
        imageUrls[ref] = `/api/files/${signFileToken(env.FILE_TOKEN_SECRET, { key: ref })}`;
      }
      return {
        pageNumber: p.pageNumber,
        markdown: p.markdown,
        imageUrls,
      };
    });

    return <SourceViewer title={data.source.title} pages={pages} pdfUrl={pdfUrl} />;
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
