import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createDb } from '@/lib/db/client';
import { loadEnv } from '@/lib/env';
import { createProviders } from '@/lib/providers';
import type { RepoContext } from '@/lib/repositories/types';
import { listProviderSettings, type ProviderSettingRow } from '@/lib/repositories/provider-settings';
import { PROVIDER_KINDS, type ProviderKind } from '@/lib/db/schema';
import { saveProviderSettings } from './actions';

export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<ProviderKind, string> = {
  llm: 'LLM',
  chat: 'Chat',
  embedding: 'Embedding',
  ocr: 'OCR',
};

export default async function ProviderSettingsPage() {
  const env = loadEnv();
  if (env.APP_MODE !== 'hosted') notFound();
  const providers = createProviders(env);
  const client = createDb(env.DATABASE_URL);

  try {
    const headersList = await headers();
    const req = new Request('http://localhost/admin/providers', { headers: headersList });
    const auth = await providers.auth.getContext(req);
    const ctx: RepoContext = { db: client.db, auth };
    if (!ctx.auth.roles.includes('admin')) notFound();

    const rows = await listProviderSettings(ctx.db);
    const byKind = new Map<ProviderKind, ProviderSettingRow>();
    for (const row of rows) byKind.set(row.kind, row);

    return (
      <div className="space-y-10">
        <header className="space-y-3">
          <div className="section-num">Admin · Providers</div>
          <h1 className="text-3xl tracking-tight">Provider settings</h1>
          <p className="max-w-[42rem] font-serif text-base italic leading-relaxed text-foreground/85">
            Override the env-derived LLM, chat, embedding, and OCR providers at runtime. Values
            are stored in the database and hot-reloaded by the worker via a Postgres NOTIFY
            channel. Leave the API key blank to keep the existing value.
          </p>
        </header>

        {PROVIDER_KINDS.map((kind) => {
          const row = byKind.get(kind);
          return (
            <section key={kind} className="space-y-4">
              <div className="flex items-baseline justify-between border-b border-rule-strong pb-2">
                <h2 className="text-sm font-medium">{KIND_LABELS[kind]}</h2>
                <span className="font-mono text-xs text-muted-foreground">
                  {row ? row.provider : 'unset'}
                </span>
              </div>
              <form action={saveProviderSettings} className="space-y-4">
                <input type="hidden" name="kind" value={kind} />
                <div className="space-y-1">
                  <label htmlFor={`${kind}-provider`} className="font-mono text-xs text-muted-foreground">
                    provider
                  </label>
                  <input
                    id={`${kind}-provider`}
                    name="provider"
                    type="text"
                    required
                    defaultValue={row?.provider ?? ''}
                    className="w-full border border-rule-strong bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${kind}-base_url`} className="font-mono text-xs text-muted-foreground">
                    base_url
                  </label>
                  <input
                    id={`${kind}-base_url`}
                    name="baseUrl"
                    type="text"
                    defaultValue={row?.baseUrl ?? ''}
                    className="w-full border border-rule-strong bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${kind}-model`} className="font-mono text-xs text-muted-foreground">
                    model
                  </label>
                  <input
                    id={`${kind}-model`}
                    name="model"
                    type="text"
                    defaultValue={row?.model ?? ''}
                    className="w-full border border-rule-strong bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor={`${kind}-api_key`} className="font-mono text-xs text-muted-foreground">
                    api_key
                  </label>
                  <input
                    id={`${kind}-api_key`}
                    name="apiKey"
                    type="password"
                    placeholder={row?.apiKeyEncrypted ? '••••••••' : 'not set'}
                    className="w-full border border-rule-strong bg-transparent px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="border border-rule-strong px-4 py-2 text-sm hover:bg-rule-strong/10"
                >
                  Save {KIND_LABELS[kind]}
                </button>
              </form>
            </section>
          );
        })}

        <p className="font-mono text-xs text-muted-foreground">
          <Link href="/admin" className="underline-offset-4 hover:underline">
            ← Back to admin
          </Link>
        </p>
      </div>
    );
  } finally {
    await client.sql.end({ timeout: 5 }).catch(() => {});
  }
}