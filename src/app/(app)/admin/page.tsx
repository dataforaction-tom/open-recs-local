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
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
          <p className="text-sm text-muted-foreground">
            Approve ownership requests and manage user roles. The recent jobs
            widget on the{' '}
            <Link href="/dashboard" className="underline hover:text-foreground">
              dashboard
            </Link>{' '}
            shows pipeline state.
          </p>
        </header>
        <OwnershipQueue rows={pending} onApprove={approveRequest} onReject={rejectRequest} />
        <RoleTable rows={users} onChange={changeUserRole} />
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}
