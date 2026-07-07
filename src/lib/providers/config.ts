import type { Sql } from 'postgres';
import type { Env } from '../env';
import type { Db } from '../db/client';
import type { ProviderKind } from '../db/schema';
import { createProviders, type Providers } from './index';
import { decryptSecret } from '../security/secrets';
import {
  listProviderSettings,
  PROVIDER_SETTINGS_CHANGED_CHANNEL,
} from '../repositories/provider-settings';

/** A provider_settings row with its API key already decrypted. */
export type DecryptedProviderRow = {
  kind: ProviderKind;
  provider: string;
  baseUrl: string | null;
  model: string | null;
  apiKey: string | null;
  extra: Record<string, unknown>;
};

// Only override a field when the row carries a non-null value, so a partial row
// (e.g. model-only) leaves the env-derived defaults for the other fields intact.
function override<T extends Record<string, unknown>>(
  target: T,
  key: keyof T,
  value: string | null,
): void {
  if (value !== null && value !== undefined) {
    (target as Record<string, unknown>)[key as string] = value;
  }
}

/**
 * Merge decrypted provider_settings rows over an env-derived config. DB wins per
 * field; env fills gaps; absent rows leave env untouched. Returns a new object
 * shaped like `Env` that `createProviders` can consume directly.
 */
export function mergeProviderConfig(env: Env, rows: DecryptedProviderRow[]): Env {
  const merged: Record<string, unknown> = { ...env };

  for (const row of rows) {
    switch (row.kind) {
      case 'llm':
        merged.LLM_PROVIDER = row.provider;
        override(merged, 'LLM_BASE_URL', row.baseUrl);
        override(merged, 'LLM_MODEL', row.model);
        override(merged, 'LLM_API_KEY', row.apiKey);
        break;
      case 'chat':
        merged.CHAT_PROVIDER = row.provider;
        override(merged, 'CHAT_BASE_URL', row.baseUrl);
        override(merged, 'CHAT_MODEL', row.model);
        override(merged, 'CHAT_API_KEY', row.apiKey);
        break;
      case 'embedding':
        merged.EMBEDDING_PROVIDER = row.provider;
        override(merged, 'EMBEDDING_BASE_URL', row.baseUrl);
        override(merged, 'EMBEDDING_MODEL', row.model);
        override(merged, 'EMBEDDING_API_KEY', row.apiKey);
        break;
      case 'ocr':
        merged.OCR_PROVIDER = row.provider;
        if (row.provider === 'docling') {
          override(merged, 'DOCLING_BASE_URL', row.baseUrl);
        } else if (row.provider === 'mistral') {
          override(merged, 'MISTRAL_API_KEY', row.apiKey);
          override(merged, 'MISTRAL_BASE_URL', row.baseUrl);
        }
        break;
    }
  }

  return merged as Env;
}

const CACHE_TTL_MS = 30_000;
// Cache both the merged config and the built Providers so a single request
// that needs both (e.g. /api/chat-search: getChatModelFromConfig + getProviders)
// doesn't issue two `listProviderSettings` queries. The cache is invalidated
// by the NOTIFY listener (see listenForProviderSettingsChanges) and a TTL.
let cache: { config: Env; providers: Providers; loadedAt: number } | null = null;

/** Reset the in-process provider cache (tests; NOTIFY-driven invalidation). */
export function clearProviderCache(): void {
  cache = null;
}

/** Read provider_settings, decrypt API keys, and merge over the env config. */
export async function loadProviderConfig(db: Db, env: Env): Promise<Env> {
  const rows = await listProviderSettings(db);
  const decrypted: DecryptedProviderRow[] = rows.map((row) => ({
    kind: row.kind,
    provider: row.provider,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: row.apiKeyEncrypted
      ? decryptSecret(env.PROVIDER_SECRET_KEY, row.apiKeyEncrypted)
      : null,
    extra: row.extra,
  }));
  return mergeProviderConfig(env, decrypted);
}

/**
 * Return the merged config (DB-stored `provider_settings` rows overlaid on
 * the raw env), cached in-process with a short TTL. Callers that need to
 * resolve provider settings without building the full `Providers` bundle
 * (e.g. the chat-search route, which only needs the chat model) should use
 * this. The cache is shared with {@link getProviders} so a single request
 * that calls both does not issue two DB queries.
 */
export async function getProviderConfig(db: Db, env: Env): Promise<Env> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.config;
  }
  const merged = await loadProviderConfig(db, env);
  const providers = createProviders(merged);
  cache = { config: merged, providers, loadedAt: now };
  return merged;
}

/**
 * Build the effective Providers from DB config merged over env, cached
 * in-process with a short TTL. The cache is cleared immediately by the NOTIFY
 * listener (see listenForProviderSettingsChanges); the TTL is the safety net.
 * Shares its cache with {@link getProviderConfig}.
 */
export async function getProviders(db: Db, env: Env): Promise<Providers> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.providers;
  }
  const merged = await loadProviderConfig(db, env);
  const providers = createProviders(merged);
  cache = { config: merged, providers, loadedAt: now };
  return providers;
}

/**
 * LISTEN on the provider-settings channel and clear the cache on any change.
 * Call once per long-lived process (the worker). Returns the unlisten cleanup.
 * Uses the postgres-js `listen` API (the same client type the worker holds, and
 * the same wrapper shape as `subscribeJobEvents` in src/lib/jobs/events.ts).
 */
export async function listenForProviderSettingsChanges(
  sql: Sql,
): Promise<{ unlisten: () => Promise<void> }> {
  const subscription = await sql.listen(PROVIDER_SETTINGS_CHANGED_CHANNEL, () => {
    clearProviderCache();
  });
  return { unlisten: subscription.unlisten };
}
