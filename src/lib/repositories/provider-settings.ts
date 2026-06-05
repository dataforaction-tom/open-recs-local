import { sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import { providerSettings, type ProviderKind } from '../db/schema';

/** Postgres NOTIFY channel fired when a provider setting changes. */
export const PROVIDER_SETTINGS_CHANGED_CHANNEL = 'provider_settings_changed';

export type ProviderSettingRow = {
  kind: ProviderKind;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  apiKeyEncrypted: string | null;
  extra: Record<string, unknown>;
};

export type UpsertProviderSettingInput = ProviderSettingRow & {
  updatedBy: string | null;
};

export async function listProviderSettings(db: Db): Promise<ProviderSettingRow[]> {
  const rows = await db
    .select({
      kind: providerSettings.kind,
      provider: providerSettings.provider,
      baseUrl: providerSettings.baseUrl,
      model: providerSettings.model,
      apiKeyEncrypted: providerSettings.apiKeyEncrypted,
      extra: providerSettings.extra,
    })
    .from(providerSettings);
  return rows;
}

export async function upsertProviderSetting(
  db: Db,
  input: UpsertProviderSettingInput,
): Promise<void> {
  await db
    .insert(providerSettings)
    .values({
      kind: input.kind,
      provider: input.provider,
      baseUrl: input.baseUrl,
      model: input.model,
      apiKeyEncrypted: input.apiKeyEncrypted,
      extra: input.extra,
      updatedBy: input.updatedBy,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: providerSettings.kind,
      set: {
        provider: input.provider,
        baseUrl: input.baseUrl,
        model: input.model,
        apiKeyEncrypted: input.apiKeyEncrypted,
        extra: input.extra,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    });

  // Fire-and-forget invalidation so long-lived processes (the worker) rebuild
  // providers immediately rather than waiting for the TTL.
  await db.execute(sql`select pg_notify(${PROVIDER_SETTINGS_CHANGED_CHANNEL}, '')`);
}
