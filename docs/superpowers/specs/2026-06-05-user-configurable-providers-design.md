# User-Configurable Providers Design

**Date:** 2026-06-05
**Status:** Approved
**Parent:** New Phase 11 (provider configurability); precedes a follow-on read-view/layout project.

## Objective

Let an admin configure the LLM, embedding, and OCR providers from inside the
app — choosing named presets (local Ollama, Ollama Cloud, OpenRouter,
OpenAI-compatible custom, Docling, Mistral OCR), entering credentials, picking a
model (with auto-discovery where available), and testing the connection — rather
than editing `.env` and restarting. Configuration is stored in the database,
encrypted at rest for secrets, read at runtime by both the web app and the
worker, and takes effect without a restart.

This is an additive layer in front of the existing env-driven provider factory.
Every current `.env`-based setup keeps working unchanged: env vars become the
fallback/default, and the database overrides them when present.

## Context

### Existing provider architecture (do not break)

- Each provider kind has an interface in `src/lib/providers/<kind>/types.ts` and
  a fake in `fake.ts`. Real adapters land alongside.
- `createProviders(env)` (`src/lib/providers/index.ts`) is the factory. Six
  internal `selectXxx(env)` functions switch on `*_PROVIDER` enum values and read
  the matching `*_BASE_URL` / `*_MODEL` / `*_API_KEY` from the validated `Env`.
- `Env` is produced by `loadEnv()` (`src/lib/env.ts`), a Zod discriminated union
  on `APP_MODE` with cross-field `superRefine` checks.
- Both the **web app** (API routes call `createProviders(env)` per request) and
  the **worker** (`src/worker.ts` builds providers once at boot, passes them into
  the job context) consume the factory. The worker is a **separate process**.
- The app already uses Postgres `LISTEN/NOTIFY` for SSE progress, so that
  mechanism is available for cache invalidation.

### What is already in place (confirmed)

- **LLM + embeddings:** the `openai-compatible` adapters
  (`src/lib/providers/llm/openai-compat.ts`,
  `src/lib/providers/embedding/openai-compat.ts`) work with any OpenAI-dialect
  server — Ollama, Ollama Cloud, OpenRouter — by setting base URL + key + model.
  **No new adapter code is required** for those providers.
- **Mistral OCR:** `src/lib/providers/ocr/mistral.ts` is fully implemented and
  wired; `OCR_PROVIDER=mistral` + `MISTRAL_API_KEY` already works today.
- **Docling OCR:** `src/lib/providers/ocr/docling.ts` is wired.
- **Model discovery (partial):** `GET /api/providers/llm/models` calls
  `listModels(baseUrl, apiKey)` for openai-compatible servers.

The substantive new work is therefore **configuration storage, the runtime
config flow, secret encryption, and the settings UI** — not provider adapters.

### Configurable surface

In scope: **LLM** (extraction + chat), **embeddings**, **OCR**. Out of scope:
storage, email, auth (remain env-only).

## Decisions (from brainstorm)

| Decision | Choice |
|----------|--------|
| Config storage & scope | One global config in the DB, admin-editable |
| Config flow | Effective-config service merging DB over env; cached; `NOTIFY` invalidation (Approach A) |
| Secret storage | Encrypted at rest (AES-256-GCM, env-held key) |
| Embedding dimension change | Validate against the 768-dim column and **block mismatches**; no re-embed |
| Settings UX | Named presets + test-connection + model auto-discovery |
| Configurable kinds | LLM, embeddings, OCR (not storage/email/auth) |

## Architecture

### 1. Data model & secret encryption

**New table `provider_settings`** (Drizzle schema in `src/lib/db/schema.ts` +
one migration). One row per configurable kind:

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | |
| `kind` | text, **unique** | `llm` \| `chat` \| `embedding` \| `ocr` |
| `provider` | text | selector value, e.g. `openai-compatible`, `mistral`, `docling`, `fake` |
| `base_url` | text null | |
| `model` | text null | |
| `api_key_encrypted` | text null | ciphertext only |
| `extra` | jsonb, default `{}` | kind-specific (e.g. embedding `dimensions`, OCR model, preset id) |
| `updated_at` | timestamptz | |
| `updated_by` | text null | user id from `RepoContext` |

The unique constraint on `kind` enforces the single-active-config-per-kind model
and makes saves a clean upsert (`ON CONFLICT (kind) DO UPDATE`).

`chat` is optional: when no `chat` row exists, the chat model falls back to the
`llm` row (mirroring the existing `CHAT_*` → `LLM_*` env behaviour).

**Encryption helper** — `src/lib/security/secrets.ts`:
- `encryptSecret(plaintext: string): string` and
  `decryptSecret(ciphertext: string): string` using Node `crypto`
  `aes-256-gcm`. Output format `base64(iv).base64(authTag).base64(ciphertext)`.
- Key derived from a new env var `PROVIDER_SECRET_KEY` (32+ chars), validated in
  `src/lib/env.ts`: **required in hosted mode**, with a documented dev default in
  local mode (same pattern as `FILE_TOKEN_SECRET`).
- The GCM auth tag means tampered ciphertext throws on decrypt rather than
  returning corrupt plaintext.

### 2. Config flow (Approach A)

- **`loadProviderConfig(env)`** — `src/lib/providers/config.ts`. Reads all
  `provider_settings` rows, decrypts `api_key_encrypted`, and merges DB values
  **over** the env-derived defaults to produce an object of the same shape
  `createProviders()` already consumes (`LLM_PROVIDER`, `LLM_BASE_URL`,
  `LLM_MODEL`, `LLM_API_KEY`, `CHAT_*`, `EMBEDDING_*`, `OCR_PROVIDER`,
  `DOCLING_BASE_URL`, `MISTRAL_API_KEY`, …). DB wins per field; env fills gaps;
  nothing set → today's defaults (`fake`).
- **`getProviders()`** — the single cached entry point replacing direct
  `createProviders(env)` calls. Builds providers from the merged config and
  caches the instance in-process, keyed by a config version/timestamp.
- **Invalidation** — a save issues `NOTIFY provider_settings_changed`. A listener
  in both the web app and the worker clears the cache; the next `getProviders()`
  rebuilds. A short in-process TTL (~30s) is the safety net if a NOTIFY is
  missed. No restart required.
- **Call sites updated to use `getProviders()`:**
  - `src/worker.ts` — resolve providers **per job** via `getProviders()` instead
    of building a boot singleton, so config changes reach in-flight workers.
  - API routes currently calling `createProviders(env)` per request
    (chat-search, recommendations, and the model-discovery route).

This is purely additive: `createProviders()` and the `Env` contract are
unchanged; the new layer sits in front of them.

### 3. Provider catalog (presets)

**Static catalog** — `src/lib/providers/catalog.ts`. Each preset declares: `id`,
`label`, applicable `kinds`, `provider` (the adapter selector it maps to),
default `baseUrl`, `requiresApiKey`, default `model(s)`, and
`supportsModelDiscovery`.

- **LLM / embeddings** (all map to the `openai-compatible` adapter):
  - `local-ollama` — `http://localhost:11434/v1`, no key, discovery yes.
  - `ollama-cloud` — key required, discovery yes.
  - `openrouter` — `https://openrouter.ai/api/v1`, key required, discovery yes.
  - `openai-compatible` — custom: user supplies base URL + key.
- **OCR:** `docling` (base URL), `mistral-ocr` (key), `fake`.

Base URLs are editable **defaults**; the exact Ollama Cloud / OpenRouter base
URLs will be confirmed against current provider docs during implementation.

### 4. API endpoints (admin-gated)

Authorization via the existing `AuthContext` / `RepoContext`: local mode resolves
to admin (single user); hosted mode requires the admin role. All under
`src/app/api/settings/providers/`:

- `GET /api/settings/providers` — effective config per kind, **API keys masked**
  (`{ configured: true }` / `false`, never the value), plus whether each field is
  sourced from DB config or env fallback.
- `PUT /api/settings/providers/[kind]` — validate (Zod, preset-aware) → encrypt
  any new key → upsert the row → `NOTIFY`.
- `POST /api/settings/providers/[kind]/test` — live round-trip using the
  **submitted (pre-save)** config: LLM = a tiny completion; embedding = embed one
  string and **return the detected dimension**; OCR = endpoint
  reachability/auth check. Never persists. If the submitted key field is blank
  (unchanged/masked), the server falls back to the **stored decrypted key** for
  that kind, so Test and Save work without re-typing an existing secret.
- `GET /api/settings/providers/[kind]/models` — model discovery; generalises the
  existing `/api/providers/llm/models` to embeddings and accepts an ad-hoc
  base/key so the UI can list models **before** saving.

### 5. Settings UI

New route **`/settings`** in the `(app)` group, a new "Settings" nav item, and a
"Settings" entry in the user menu; admin-gated via `FeatureGate` + role. One card
per kind (LLM, Embeddings, OCR), each following the existing editorial design
system (`section-num`, `eyebrow`, `paper-2`, `rule`):

- **Preset dropdown** → prefills base URL and toggles the key field's visibility.
- **Model field** — a dropdown with a refresh button when discovery is
  available; free-text otherwise.
- **API key** — masked input; shows `•••• set` when already configured; only
  submitted when the user changes it (blank = keep existing ciphertext).
- **Test connection** button with inline success/failure; the embedding test
  surfaces the detected vector dimension.
- **Save** button.
- An **Advanced** disclosure on the LLM card for the optional separate **chat**
  model override.
- A status line showing what is currently active per field and whether it comes
  from DB config or env fallback.

Forms use the existing React Hook Form + Zod pattern and shadcn primitives.

## Validation & error handling

- Per-kind Zod schemas for save payloads, preset-aware (cloud presets require a
  key; custom requires a base URL).
- **Embedding dimension guard:** on **test and save**, embed one probe string,
  compare the returned length to `EMBEDDING_DIM` (768), and block mismatches with
  an actionable message (e.g. "model returns 1536-dim vectors; this instance is
  fixed at 768 — re-embedding isn't supported yet").
- **Secrets:** plaintext keys never leave the server; masked on read; an
  unchanged key field preserves the stored ciphertext.
- **Fallback states:** empty DB → env; neither configured → `fake`, surfaced in
  the UI as "not configured".
- **Test failures** mapped to actionable messages (401 bad key, unreachable URL,
  model not found, dimension mismatch).
- NOTIFY listener failure degrades gracefully to TTL expiry.

## Testing strategy

Every data-touching change keeps Testcontainers (pgvector pg16) coverage — no DB
mocks. Presentational components get vitest + Testing Library render tests.
`pnpm verify` (typecheck + lint + vitest + build) green before each commit.

- **Encryption** unit tests: round-trip; GCM tamper detection (mutated
  ciphertext throws).
- **`loadProviderConfig` merge** tests: DB-over-env precedence, partial rows,
  `chat` → `llm` fallback, nothing-set → defaults.
- **Testcontainers integration:** upsert per kind, decrypt-on-read, `NOTIFY`
  cache invalidation, save → `getProviders()` reflects the change.
- **Endpoint tests:** admin gating (hosted mode denies non-admins), key masking,
  test-connection against fake providers, dimension-mismatch block.
- **UI component tests:** preset prefill, masked-key submit behaviour, test
  feedback rendering.

## Sequencing (implementation order)

1. **Schema + encryption** — `provider_settings` table + migration;
   `secrets.ts` helper; `PROVIDER_SECRET_KEY` env wiring. Tests first.
2. **Config flow** — `loadProviderConfig`, `getProviders`, NOTIFY invalidation;
   migrate worker + API call sites onto `getProviders()`.
3. **Catalog + endpoints** — preset catalog; GET/PUT/test/models routes with
   admin gating, masking, dimension guard.
4. **Settings UI** — `/settings` page, per-kind cards, nav entry.

Each step is an independent TDD commit ending green.

## Out of scope (YAGNI)

- Per-user provider config (global only).
- Re-embedding / vector-column migration when the embedding dimension changes
  (mismatches are blocked, not migrated) — its own future project.
- Making storage, email, or auth configurable in-app.
- Provider config import/export, versioning, or audit history beyond
  `updated_at` / `updated_by`.
- The separate read-view/layout-completeness project (brainstormed next).
