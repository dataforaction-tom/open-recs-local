# Configurable Providers — PR1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the LLM, embedding, and OCR providers configurable from the database at runtime — stored with encrypted secrets, merged over the existing env defaults, and picked up by both the worker (per job) and the web routes (per request) with no restart.

**Architecture:** Additive layer in front of the existing env-driven `createProviders(env)` factory. A new `provider_settings` table holds one row per configurable kind. `loadProviderConfig(db, env)` reads those rows, decrypts secrets, and merges them **over** the env-derived `Env` object — DB wins, env fills gaps, nothing set falls back to today's defaults. `getProviders(db, env)` wraps that with a short in-process TTL cache (cleared immediately on a Postgres `NOTIFY`). The worker resolves providers per job; web routes resolve per request. `createProviders` and the `Env` contract are unchanged.

**Tech Stack:** TypeScript (strict), Drizzle ORM + drizzle-kit, Postgres + pgvector, Node `crypto` (AES-256-GCM), Zod, Vitest + Testcontainers (`pgvector/pgvector:pg16`).

**Spec:** `docs/superpowers/specs/2026-06-05-user-configurable-providers-design.md` (Sections "Data model & secret encryption", "Config flow").

---

## File structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/db/schema.ts` | Add `PROVIDER_KINDS` const + `providerSettings` table | Modify |
| `src/lib/db/migrations/NNNN_*.sql` | Generated migration for the new table | Create (via drizzle-kit) |
| `src/lib/repositories/provider-settings.ts` | `listProviderSettings` (read) + `upsertProviderSetting` (write, emits NOTIFY) | Create |
| `src/lib/repositories/provider-settings.test.ts` | Testcontainers tests for the repo | Create |
| `src/lib/security/secrets.ts` | `encryptSecret` / `decryptSecret` (AES-256-GCM) | Create |
| `src/lib/security/secrets.test.ts` | Unit tests for the crypto helper | Create |
| `src/lib/env.ts` | Add `PROVIDER_SECRET_KEY` to local (dev default) + hosted (required) | Modify |
| `src/lib/providers/config.ts` | `mergeProviderConfig`, `loadProviderConfig`, `getProviders`, cache + NOTIFY helpers | Create |
| `src/lib/providers/config.test.ts` | Unit tests for the pure `mergeProviderConfig` | Create |
| `src/lib/providers/config.integration.test.ts` | Testcontainers tests for `loadProviderConfig` / `getProviders` | Create |
| `src/lib/jobs/context.ts` | Split `JobDeps` (no providers) from `JobContext` (handler-facing, with providers) | Modify |
| `src/lib/jobs/handlers/index.ts` | Resolve providers per job; inject into per-call context | Modify |
| `src/lib/jobs/handlers/index.test.ts` | Unit test per-job provider resolution via injected resolver | Create |
| `src/worker.ts` | Stop building boot-time providers; start NOTIFY listener | Modify |
| `src/app/api/**` routes using llm/embedding/ocr | Switch `createProviders(env)` → `await getProviders(db, env)` | Modify |
| `.env.example` | Document `PROVIDER_SECRET_KEY` | Modify |

**Convention notes (verified):**
- Tables: `pgTable('name', { ... }, (t) => ({ ...indexes }))`; ids `uuid('id').primaryKey().defaultRandom()`; timestamps `timestamp('x', { withTimezone: true }).notNull().defaultNow()`; jsonb `jsonb('x').$type<...>().notNull().default({})`; text enum `text('x', { enum: CONST }).notNull()`.
- Migrations are **drizzle-kit generated** into `src/lib/db/migrations/` via `pnpm db:generate`, applied by `tsx src/lib/db/migrate.ts` (`pnpm db:migrate`). Filenames are auto-named `NNNN_<word>_<word>.sql` — commit whatever is generated.
- Token/secret helpers take the secret as an argument (see `signFileToken(secret, opts)` in `src/lib/files/sign.ts`); mirror that — `encryptSecret(secret, plaintext)`.
- Testcontainers harness: `startPostgres()` (`tests/helpers/pg-container`), `applyMigrations(url)` (`tests/helpers/migrate`), `createDb(url)` (`src/lib/db/client`). `beforeAll` timeout `120_000`.
- `RepoContext = { db: Db; auth: AuthContext }`; `AuthContext = { user, roles: Role[], isSystem: boolean }`. Write-permission check pattern: `ctx.auth.isSystem || ctx.auth.roles.includes('admin')`.

---

## Task 1: `provider_settings` table + repository

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/migrations/NNNN_*.sql` (generated)
- Create: `src/lib/repositories/provider-settings.ts`
- Test: `src/lib/repositories/provider-settings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/repositories/provider-settings.test.ts`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { listProviderSettings, upsertProviderSetting } from './provider-settings';

let pg: StartedPg;
let client: DbClient;

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

describe('providerSettings repo', () => {
  it('upserts a row and reads it back', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      apiKeyEncrypted: 'cipher-1',
      extra: { presetId: 'local-ollama' },
      updatedBy: 'system',
    });

    const rows = await listProviderSettings(client.db);
    const llm = rows.find((r) => r.kind === 'llm');
    expect(llm).toMatchObject({
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://localhost:11434/v1',
      model: 'llama3.1',
      apiKeyEncrypted: 'cipher-1',
    });
    expect(llm?.extra).toEqual({ presetId: 'local-ollama' });
  });

  it('upserting the same kind updates in place (no duplicate)', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://a/v1',
      model: 'nomic-embed-text',
      apiKeyEncrypted: null,
      extra: {},
      updatedBy: 'system',
    });
    await upsertProviderSetting(client.db, {
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://b/v1',
      model: 'nomic-embed-text',
      apiKeyEncrypted: null,
      extra: {},
      updatedBy: 'system',
    });

    const rows = await listProviderSettings(client.db);
    const embeddingRows = rows.filter((r) => r.kind === 'embedding');
    expect(embeddingRows).toHaveLength(1);
    expect(embeddingRows[0]?.baseUrl).toBe('http://b/v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/repositories/provider-settings.test.ts`
Expected: FAIL — module `./provider-settings` not found / `provider_settings` relation does not exist.

- [ ] **Step 3a: Add the table to the schema**

In `src/lib/db/schema.ts`, near the other top-level consts add:

```typescript
export const PROVIDER_KINDS = ['llm', 'chat', 'embedding', 'ocr'] as const;
export type ProviderKind = (typeof PROVIDER_KINDS)[number];
```

And add the table (place it after the existing tables, before any `relations` block):

```typescript
export const providerSettings = pgTable('provider_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind', { enum: PROVIDER_KINDS }).notNull().unique(),
  provider: text('provider').notNull(),
  baseUrl: text('base_url'),
  model: text('model'),
  apiKeyEncrypted: text('api_key_encrypted'),
  extra: jsonb('extra').$type<Record<string, unknown>>().notNull().default({}),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

(`pgTable`, `text`, `uuid`, `jsonb`, `timestamp` are already imported at the top of `schema.ts`.)

- [ ] **Step 3b: Generate the migration**

Run: `pnpm db:generate`
Expected: a new file `src/lib/db/migrations/NNNN_*.sql` containing `CREATE TABLE "provider_settings"` with a `UNIQUE("kind")` constraint. Inspect it to confirm the unique constraint and jsonb default are present.

- [ ] **Step 3c: Write the repository**

Create `src/lib/repositories/provider-settings.ts`:

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/repositories/provider-settings.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations src/lib/repositories/provider-settings.ts src/lib/repositories/provider-settings.test.ts
git commit -m "feat(providers): provider_settings table + repository"
```

---

## Task 2: AES-256-GCM secrets helper

**Files:**
- Create: `src/lib/security/secrets.ts`
- Test: `src/lib/security/secrets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/security/secrets.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { encryptSecret, decryptSecret } from './secrets';

const SECRET = 'a-test-encryption-key-at-least-32-chars';

describe('secrets', () => {
  it('round-trips a value', () => {
    const cipher = encryptSecret(SECRET, 'sk-live-12345');
    expect(cipher).not.toContain('sk-live-12345');
    expect(decryptSecret(SECRET, cipher)).toBe('sk-live-12345');
  });

  it('produces a different ciphertext each call (random IV)', () => {
    const a = encryptSecret(SECRET, 'same');
    const b = encryptSecret(SECRET, 'same');
    expect(a).not.toBe(b);
    expect(decryptSecret(SECRET, a)).toBe('same');
    expect(decryptSecret(SECRET, b)).toBe('same');
  });

  it('throws when the ciphertext is tampered with', () => {
    const cipher = encryptSecret(SECRET, 'secret-value');
    const parts = cipher.split('.');
    // Flip a character in the ciphertext segment.
    const tamperedSegment = parts[2]!.startsWith('A')
      ? `B${parts[2]!.slice(1)}`
      : `A${parts[2]!.slice(1)}`;
    const tampered = `${parts[0]}.${parts[1]}.${tamperedSegment}`;
    expect(() => decryptSecret(SECRET, tampered)).toThrow();
  });

  it('throws when decrypted with the wrong key', () => {
    const cipher = encryptSecret(SECRET, 'secret-value');
    expect(() => decryptSecret('a-different-key-also-32-characters-x', cipher)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/security/secrets.test.ts`
Expected: FAIL — module `./secrets` not found.

- [ ] **Step 3: Write the implementation**

Create `src/lib/security/secrets.ts`:

```typescript
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// AES-256-GCM. The 256-bit key is derived from the provided secret via SHA-256
// so any sufficiently long secret string works (mirrors how FILE_TOKEN_SECRET
// is used). Output format: base64(iv).base64(authTag).base64(ciphertext).
const IV_BYTES = 12; // 96-bit nonce, the GCM standard.

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret, 'utf8').digest();
}

export function encryptSecret(secret: string, plaintext: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(
    '.',
  );
}

export function decryptSecret(secret: string, payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) {
    throw new Error('invalid secret payload');
  }
  const [ivB64, authTagB64, ciphertextB64] = parts as [string, string, string];
  const key = deriveKey(secret);
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  // .final() throws if the auth tag does not match (tampering / wrong key).
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/security/secrets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/security/secrets.ts src/lib/security/secrets.test.ts
git commit -m "feat(security): AES-256-GCM secret encryption helper"
```

---

## Task 3: `PROVIDER_SECRET_KEY` env var

**Files:**
- Modify: `src/lib/env.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write the failing test**

Create `src/lib/env.provider-secret.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const base = {
  APP_MODE: 'local',
  DATABASE_URL: 'postgres://localhost:5432/app',
};

describe('PROVIDER_SECRET_KEY', () => {
  it('defaults to a dev value in local mode', () => {
    const env = loadEnv({ ...base });
    expect(env.PROVIDER_SECRET_KEY.length).toBeGreaterThanOrEqual(32);
  });

  it('accepts an override in local mode', () => {
    const env = loadEnv({ ...base, PROVIDER_SECRET_KEY: 'x'.repeat(40) });
    expect(env.PROVIDER_SECRET_KEY).toBe('x'.repeat(40));
  });

  it('is required in hosted mode', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'hosted',
        DATABASE_URL: 'postgres://localhost:5432/app',
        BETTER_AUTH_SECRET: 'y'.repeat(32),
        BETTER_AUTH_URL: 'http://localhost:3000',
        FILE_TOKEN_SECRET: 'z'.repeat(32),
        // PROVIDER_SECRET_KEY intentionally omitted
      }),
    ).toThrow(/PROVIDER_SECRET_KEY/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/env.provider-secret.test.ts`
Expected: FAIL — `env.PROVIDER_SECRET_KEY` is `undefined` (length read throws / hosted case does not throw).

- [ ] **Step 3: Add the env field**

In `src/lib/env.ts`, add a dev default constant next to `LOCAL_FILE_TOKEN_DEFAULT`:

```typescript
const LOCAL_PROVIDER_SECRET_DEFAULT = 'local-dev-only-provider-secret-key';
```

Add the field to the `local` object (after `FILE_TOKEN_SECRET`):

```typescript
  PROVIDER_SECRET_KEY: z.string().min(32).default(LOCAL_PROVIDER_SECRET_DEFAULT),
```

Add it to the `hosted` object (after `FILE_TOKEN_SECRET`):

```typescript
  PROVIDER_SECRET_KEY: z.string().min(32),
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/env.provider-secret.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Document it**

In `.env.example`, under the provider section, add:

```bash
# Encryption key for provider API keys stored in the database (AES-256-GCM).
# Local mode falls back to a dev default; hosted mode REQUIRES a real 32+ char value.
PROVIDER_SECRET_KEY=
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/env.ts src/lib/env.provider-secret.test.ts .env.example
git commit -m "feat(env): add PROVIDER_SECRET_KEY for provider secret encryption"
```

---

## Task 4: `mergeProviderConfig` (pure merge)

**Files:**
- Create: `src/lib/providers/config.ts`
- Test: `src/lib/providers/config.test.ts`

This pure function maps decrypted `provider_settings` rows onto the `Env`-shaped
object that `createProviders` consumes. DB values win; env fills gaps.

- [ ] **Step 1: Write the failing test**

Create `src/lib/providers/config.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { loadEnv, type Env } from '../env';
import { mergeProviderConfig, type DecryptedProviderRow } from './config';

function baseEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    APP_MODE: 'local',
    DATABASE_URL: 'postgres://localhost:5432/app',
    ...overrides,
  });
}

describe('mergeProviderConfig', () => {
  it('returns env unchanged when there are no rows', () => {
    const env = baseEnv({ LLM_PROVIDER: 'fake' });
    expect(mergeProviderConfig(env, [])).toEqual(env);
  });

  it('overrides LLM_* from an llm row', () => {
    const env = baseEnv();
    const rows: DecryptedProviderRow[] = [
      {
        kind: 'llm',
        provider: 'openai-compatible',
        baseUrl: 'http://ollama/v1',
        model: 'llama3.1',
        apiKey: 'sk-abc',
        extra: {},
      },
    ];
    const merged = mergeProviderConfig(env, rows);
    expect(merged.LLM_PROVIDER).toBe('openai-compatible');
    expect(merged.LLM_BASE_URL).toBe('http://ollama/v1');
    expect(merged.LLM_MODEL).toBe('llama3.1');
    expect(merged.LLM_API_KEY).toBe('sk-abc');
  });

  it('maps an embedding row to EMBEDDING_*', () => {
    const env = baseEnv();
    const merged = mergeProviderConfig(env, [
      {
        kind: 'embedding',
        provider: 'openai-compatible',
        baseUrl: 'http://emb/v1',
        model: 'nomic-embed-text',
        apiKey: null,
        extra: {},
      },
    ]);
    expect(merged.EMBEDDING_PROVIDER).toBe('openai-compatible');
    expect(merged.EMBEDDING_BASE_URL).toBe('http://emb/v1');
    expect(merged.EMBEDDING_MODEL).toBe('nomic-embed-text');
    expect(merged.EMBEDDING_API_KEY).toBeUndefined();
  });

  it('maps an ocr docling row to OCR_PROVIDER + DOCLING_BASE_URL', () => {
    const merged = mergeProviderConfig(baseEnv(), [
      { kind: 'ocr', provider: 'docling', baseUrl: 'http://docling:5001', model: null, apiKey: null, extra: {} },
    ]);
    expect(merged.OCR_PROVIDER).toBe('docling');
    expect(merged.DOCLING_BASE_URL).toBe('http://docling:5001');
  });

  it('maps an ocr mistral row to OCR_PROVIDER + MISTRAL_API_KEY (+ base url)', () => {
    const merged = mergeProviderConfig(baseEnv(), [
      { kind: 'ocr', provider: 'mistral', baseUrl: 'https://api.mistral.ai', model: null, apiKey: 'sk-mistral', extra: {} },
    ]);
    expect(merged.OCR_PROVIDER).toBe('mistral');
    expect(merged.MISTRAL_API_KEY).toBe('sk-mistral');
    expect(merged.MISTRAL_BASE_URL).toBe('https://api.mistral.ai');
  });

  it('maps a chat row to CHAT_*', () => {
    const merged = mergeProviderConfig(baseEnv(), [
      { kind: 'chat', provider: 'openai-compatible', baseUrl: 'http://chat/v1', model: 'small', apiKey: 'sk-chat', extra: {} },
    ]);
    expect(merged.CHAT_PROVIDER).toBe('openai-compatible');
    expect(merged.CHAT_BASE_URL).toBe('http://chat/v1');
    expect(merged.CHAT_MODEL).toBe('small');
    expect(merged.CHAT_API_KEY).toBe('sk-chat');
  });

  it('keeps env base URL when a row only sets the model', () => {
    const env = baseEnv({
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://env-base/v1',
      LLM_MODEL: 'env-model',
    });
    const merged = mergeProviderConfig(env, [
      { kind: 'llm', provider: 'openai-compatible', baseUrl: null, model: 'db-model', apiKey: null, extra: {} },
    ]);
    expect(merged.LLM_BASE_URL).toBe('http://env-base/v1');
    expect(merged.LLM_MODEL).toBe('db-model');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/providers/config.test.ts`
Expected: FAIL — module `./config` not found.

- [ ] **Step 3: Write the merge function**

Create `src/lib/providers/config.ts` with (the rest of this file is filled in by
Task 5 — for now only the merge + types):

```typescript
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/providers/config.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/config.ts src/lib/providers/config.test.ts
git commit -m "feat(providers): mergeProviderConfig — DB config over env"
```

---

## Task 5: `loadProviderConfig` + `getProviders` (cache + invalidation)

**Files:**
- Modify: `src/lib/providers/config.ts`
- Test: `src/lib/providers/config.integration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/providers/config.integration.test.ts`:

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startPostgres, type StartedPg } from '../../../tests/helpers/pg-container';
import { applyMigrations } from '../../../tests/helpers/migrate';
import { createDb, type DbClient } from '../db/client';
import { loadEnv, type Env } from '../env';
import { encryptSecret } from '../security/secrets';
import { upsertProviderSetting } from '../repositories/provider-settings';
import { clearProviderCache, getProviders, loadProviderConfig } from './config';

let pg: StartedPg;
let client: DbClient;

function env(): Env {
  return loadEnv({ APP_MODE: 'local', DATABASE_URL: pg.url, PROVIDER_SECRET_KEY: 'k'.repeat(40) });
}

beforeAll(async () => {
  pg = await startPostgres();
  await applyMigrations(pg.url).then(({ sql }) => sql.end());
  client = createDb(pg.url);
}, 120_000);

afterAll(async () => {
  await client?.sql.end();
  await pg?.container.stop();
});

beforeEach(() => {
  clearProviderCache();
});

describe('loadProviderConfig', () => {
  it('merges a DB row over env and decrypts the API key', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'llm',
      provider: 'openai-compatible',
      baseUrl: 'http://db-ollama/v1',
      model: 'db-model',
      apiKeyEncrypted: encryptSecret('k'.repeat(40), 'sk-secret'),
      extra: {},
      updatedBy: 'system',
    });

    const merged = await loadProviderConfig(client.db, env());
    expect(merged.LLM_PROVIDER).toBe('openai-compatible');
    expect(merged.LLM_BASE_URL).toBe('http://db-ollama/v1');
    expect(merged.LLM_API_KEY).toBe('sk-secret');
  });
});

describe('getProviders', () => {
  it('builds providers from DB config', async () => {
    await upsertProviderSetting(client.db, {
      kind: 'embedding',
      provider: 'openai-compatible',
      baseUrl: 'http://db-emb/v1',
      model: 'nomic-embed-text',
      apiKeyEncrypted: null,
      extra: {},
      updatedBy: 'system',
    });

    const providers = await getProviders(client.db, env());
    expect(providers.embedding.name).toBe('openai-compat');
    expect(providers.embedding.model).toBe('nomic-embed-text');
  });

  it('caches until cleared', async () => {
    const first = await getProviders(client.db, env());
    const second = await getProviders(client.db, env());
    expect(second).toBe(first); // same cached instance
    clearProviderCache();
    const third = await getProviders(client.db, env());
    expect(third).not.toBe(first);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/providers/config.integration.test.ts`
Expected: FAIL — `loadProviderConfig` / `getProviders` / `clearProviderCache` are not exported.

- [ ] **Step 3: Extend `config.ts`**

Append to `src/lib/providers/config.ts` (and add the imports shown at the top):

```typescript
// --- add to the imports at the top of the file ---
import type { Sql } from 'postgres';
import type { Db } from '../db/client';
import { createProviders, type Providers } from './index';
import { decryptSecret } from '../security/secrets';
import {
  listProviderSettings,
  PROVIDER_SETTINGS_CHANGED_CHANNEL,
} from '../repositories/provider-settings';

// --- append below mergeProviderConfig ---

const CACHE_TTL_MS = 30_000;
let cache: { providers: Providers; loadedAt: number } | null = null;

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
 * Build the effective Providers from DB config merged over env, cached
 * in-process with a short TTL. The cache is cleared immediately by the NOTIFY
 * listener (see listenForProviderSettingsChanges); the TTL is the safety net.
 */
export async function getProviders(db: Db, env: Env): Promise<Providers> {
  const now = Date.now();
  if (cache && now - cache.loadedAt < CACHE_TTL_MS) {
    return cache.providers;
  }
  const merged = await loadProviderConfig(db, env);
  const providers = createProviders(merged);
  cache = { providers, loadedAt: now };
  return providers;
}

/**
 * LISTEN on the provider-settings channel and clear the cache on any change.
 * Call once per long-lived process (the worker). Returns the unlisten cleanup.
 * Uses the postgres-js `listen` API (the same client type the worker holds).
 */
export async function listenForProviderSettingsChanges(sql: Sql): Promise<{ unlisten: () => Promise<void> }> {
  const subscription = await sql.listen(PROVIDER_SETTINGS_CHANGED_CHANNEL, () => {
    clearProviderCache();
  });
  return { unlisten: subscription.unlisten };
}
```

> Note: `sql.listen` is provided by postgres-js (already the project's driver — see `src/worker.ts` which holds a `Sql`). If the existing SSE code wraps LISTEN differently, follow that wrapper instead; the contract here is "on notification, call `clearProviderCache()`".

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/providers/config.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/providers/config.ts src/lib/providers/config.integration.test.ts
git commit -m "feat(providers): loadProviderConfig + getProviders with cache + NOTIFY invalidation"
```

---

## Task 6: Resolve providers per job in the worker

The worker currently builds `providers` once at boot and passes them into every
handler via `JobContext`. Switch to resolving providers **per job** so DB config
changes apply without a restart, and start the NOTIFY listener.

**Files:**
- Modify: `src/lib/jobs/context.ts`
- Modify: `src/lib/jobs/handlers/index.ts`
- Create: `src/lib/jobs/handlers/index.test.ts`
- Modify: `src/worker.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/jobs/handlers/index.test.ts`:

```typescript
import { describe, expect, it, vi } from 'vitest';
import { registerHandlers } from './index';
import type { Providers } from '../../providers';

// Minimal fake queue that records registered handlers so we can invoke them.
function fakeQueue() {
  const handlers = new Map<string, (payload: unknown) => Promise<unknown>>();
  return {
    handlers,
    register: vi.fn(async (name: string, fn: (payload: unknown) => Promise<unknown>) => {
      handlers.set(name, fn);
    }),
    schedule: vi.fn(async () => {}),
  };
}

describe('registerHandlers — per-job provider resolution', () => {
  it('resolves providers via the injected resolver for each job', async () => {
    const queue = fakeQueue();
    const fakeProviders = { embedding: { name: 'stub' } } as unknown as Providers;
    const resolveProviders = vi.fn(async () => fakeProviders);

    await registerHandlers({
      queue: queue as never,
      db: {} as never,
      env: {} as never,
      emit: async () => {},
      resolveProviders,
    });

    // Invoking a registered job triggers a fresh provider resolution.
    const embed = queue.handlers.get('source.embed')!;
    await embed({ sourceId: 'x' }).catch(() => {}); // handler body may no-op on stub
    expect(resolveProviders).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test src/lib/jobs/handlers/index.test.ts`
Expected: FAIL — `registerHandlers` does not accept `resolveProviders` (type error / not called).

- [ ] **Step 3a: Split the context types**

In `src/lib/jobs/context.ts`, change so providers are no longer required up-front.
Keep the handler-facing `JobContext` (with `providers`) and add a `JobDeps`
without it plus an optional resolver:

```typescript
import type { Providers } from '../providers';
// ...existing imports (Queue, Db, Env, JobEvent)...

export type JobContext = {
  queue: Queue;
  db: Db;
  providers: Providers;
  env: Env;
  emit: (jobId: string, event: JobEvent) => Promise<void>;
};

export type JobDeps = Omit<JobContext, 'providers'> & {
  /** Resolve the effective providers for a single job. Defaults to getProviders. */
  resolveProviders?: (db: Db, env: Env) => Promise<Providers>;
};
```

- [ ] **Step 3b: Resolve per job in `registerHandlers`**

In `src/lib/jobs/handlers/index.ts`, change the signature to `JobDeps` and wrap
each handler so it resolves providers per invocation:

```typescript
import { getProviders } from '../../providers/config';
import type { JobContext, JobDeps } from '../context';
// ...existing handler imports...

export async function registerHandlers(deps: JobDeps): Promise<void> {
  const resolve = deps.resolveProviders ?? getProviders;
  const withProviders = async (): Promise<JobContext> => {
    const providers = await resolve(deps.db, deps.env);
    return { ...deps, providers };
  };

  await deps.queue.register('source.parse', async (payload) =>
    parseHandler(await withProviders(), payload),
  );
  await deps.queue.register('source.extract', async (payload) =>
    extractHandler(await withProviders(), payload),
  );
  await deps.queue.register('source.embed', async (payload) =>
    embedHandler(await withProviders(), payload),
  );
  await deps.queue.register('analytics.refresh', async () =>
    analyticsRefreshHandler(await withProviders()),
  );
  await deps.queue.schedule('analytics.refresh', '0 2 * * *');
}
```

(Individual handlers are unchanged — they still read `ctx.providers`.)

- [ ] **Step 3c: Update the worker**

In `src/worker.ts`: remove the boot-time `const providers = createProviders(env);`
and the `providers` field from the `registerHandlers` call, and start the
listener. Replace the relevant lines:

```typescript
import { listenForProviderSettingsChanges } from '@/lib/providers/config';
// remove: import { createProviders } from '@/lib/providers';

// ...inside main(), after `sql = dbContext.sql;` and queue creation...
const { unlisten } = await listenForProviderSettingsChanges(sql);

// registerHandlers call — drop `providers`:
await registerHandlers({ queue, db: dbContext.db, env, emit });

// in shutdown(), before draining the queue:
await unlisten().catch(() => {});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test src/lib/jobs/handlers/index.test.ts`
Expected: PASS.

Then run the existing worker/handler tests to confirm no regression:

Run: `pnpm test src/lib/jobs`
Expected: PASS (existing handler tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/jobs/context.ts src/lib/jobs/handlers/index.ts src/lib/jobs/handlers/index.test.ts src/worker.ts
git commit -m "feat(jobs): resolve providers per job from DB config"
```

---

## Task 7: Migrate web routes to `getProviders`

Web API routes that use the **llm / embedding / ocr** providers must read DB
config instead of pure env, so saved settings take effect on the web side too.
Routes that use only `auth` / `storage` / `email` can stay on `createProviders`
(those kinds are not DB-configurable in this project).

**Files:**
- Modify: each route identified below.

- [ ] **Step 1: Find the call sites**

Run: `rg -n "createProviders" src/app`
Inspect each hit. Migrate the ones whose subsequent code touches
`providers.llm`, `providers.embedding`, or `providers.ocr`. Known candidates:
- `src/app/api/chat-search/route.ts` (chat + embedding)
- `src/app/api/recommendations/route.ts` and/or `src/app/api/search/route.ts` (embedding)
- `src/app/api/sources/route.ts` — uses `providers.storage` + `providers.auth` only; **leave as-is** unless it also reads llm/embedding/ocr.

- [ ] **Step 2: Migrate each identified route**

In each identified route, replace the synchronous factory call with the cached
DB-aware resolver. The route already has a db client (`client.db`) at that point:

```typescript
// before:
const providers = createProviders(env);
// after:
const providers = await getProviders(client.db, env);
```

Add the import: `import { getProviders } from '@/lib/providers/config';` and
remove the now-unused `createProviders` import if nothing else uses it. If
`getProviders` is needed before `client` is created, move the `createDb` call up
so `client.db` exists first (mirror the ordering in `src/app/api/sources/route.ts`).

- [ ] **Step 3: Run the affected route tests + typecheck**

Run: `pnpm test src/app/api`
Expected: PASS (existing route tests still green).

Run: `pnpm exec tsc --noEmit`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api
git commit -m "feat(api): resolve providers from DB config in web routes"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the whole verify pipeline**

Run: `pnpm verify`
Expected: typecheck + lint + vitest + build all PASS. (Postgres-touching tests
use Testcontainers; Docker must be running.)

- [ ] **Step 2: Confirm no regression in provider behaviour with empty config**

With no `provider_settings` rows, `loadProviderConfig` must return env unchanged
(covered by Task 4's "no rows" test and Task 5's integration test). Spot-check
that a fresh DB still boots the worker on the env-configured provider.

- [ ] **Step 3: Commit any lint/format fixups if needed**

```bash
git add -A
git commit -m "chore(providers): PR1 verification fixups"
```

---

## Self-review notes (carried into execution)

- **Spec coverage:** PR1 implements the spec's "Data model & secret encryption"
  and "Config flow (Approach A)" sections. Endpoints (PR2) and Settings UI (PR3)
  are out of scope here.
- **Known limitation:** the web process relies on the 30s TTL for cache
  freshness (only the worker runs the NOTIFY listener in PR1). After PR2's save
  endpoint emits NOTIFY, the worker invalidates immediately; web read paths
  refresh within 30s. A web-side listener can be added later if that lag matters.
- **Type consistency:** `DecryptedProviderRow` (config.ts) vs `ProviderSettingRow`
  (repo, carries `apiKeyEncrypted`) are deliberately distinct — the repo stores
  ciphertext, config.ts works in plaintext after decryption.
- **`sql.listen` contract:** verify the exact postgres-js listen API against the
  existing SSE LISTEN code (`src/lib/jobs/events.ts` / the stream route) and match
  that wrapper if it differs.
- **OCR mapping:** only `docling` (base URL) and `mistral` (API key + optional
  base URL) are mapped, matching the wired adapters. Other OCR enum values pass
  through to `createProviders`, which throws `notWired` as it does today.
```
