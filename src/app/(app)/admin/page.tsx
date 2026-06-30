import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import { listPendingOwnershipRequests } from '@/lib/repositories/ownership-request';
import { listUsersWithRoles } from '@/lib/repositories/user-role';
import type { RepoContext } from '@/lib/repositories/types';
import { OwnershipQueue } from '@/components/admin/ownership-queue';
import { RoleTable } from '@/components/admin/role-table';
import {
  approveRequest,
  changeUserRole,
  rejectRequest,
} from './actions';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const env = loadEnv();
  if (env.APP_MODE !== 'hosted') notFound();

  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/admin', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };

    if (!ctx.auth.roles.includes('admin')) notFound();

    const [pending, users] = await Promise.all([
      listPendingOwnershipRequests(ctx),
      listUsersWithRoles(ctx),
    ]);

    return (
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="section-num">Admin</div>
          <h1 className="text-4xl tracking-tight">Stewardship of the collection</h1>
          <p className="font-serif text-base italic text-muted-foreground">
            Approve ownership requests and tune user roles. The pipeline state lives on the{' '}
            <Link
              href="/dashboard"
              className="text-accent not-italic underline-offset-4 hover:underline"
            >
              dashboard
            </Link>
            .
          </p>
        </header>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <h2 className="text-sm font-medium">Ownership requests</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {pending.length} pending
            </span>
          </div>
          <OwnershipQueue
            rows={pending}
            onApprove={approveRequest}
            onReject={rejectRequest}
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <h2 className="text-sm font-medium">User roles</h2>
            <span className="font-mono text-xs text-muted-foreground">
              {users.length} accounts
            </span>
          </div>
          <RoleTable rows={users} onChange={changeUserRole} />
        </section>

        <section className="space-y-4">
          <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
            <h2 className="text-sm font-medium">Provider settings</h2>
          </div>
          <p className="font-mono text-xs text-muted-foreground">
            Override LLM, chat, embedding, and OCR providers at runtime on the{' '}
            <Link
              href="/admin/providers"
              className="text-accent underline-offset-4 hover:underline"
            >
              provider settings
            </Link>{' '}
            page.
          </p>
        </section>
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
