import type { Env } from '../env';
import type { ProviderKind } from '../db/schema';

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
