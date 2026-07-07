import { generateText, embedMany } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { EMBEDDING_DIM, type ProviderKind } from '../db/schema';
import { createFakeLlm } from './llm/fake';
import { createFakeEmbedding } from './embedding/fake';

/**
 * Input for a live round-trip provider test. Carries the submitted (pre-save)
 * configuration so the test can run without persisting anything. When `apiKey`
 * is blank, the caller (the route) is responsible for filling in the stored
 * decrypted key before calling this function — see {@link testProviderConnection}
 * which treats a blank key as "no auth" rather than falling back to storage.
 */
export type TestConnectionInput = {
  kind: ProviderKind;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

/**
 * Result of a live round-trip test. `dimension` is only present for the
 * embedding kind and reports the actual vector length returned by the server
 * (which may differ from {@link EMBEDDING_DIM} — the caller surfaces the
 * mismatch rather than silently enforcing the schema's fixed width).
 */
export type TestConnectionResult = {
  ok: boolean;
  kind: ProviderKind;
  /** Present and set only on a successful embedding test. */
  dimension?: number;
  /** Present only when `ok` is false. */
  error?: string;
};

const MISTRAL_DEFAULT_BASE_URL = 'https://api.mistral.ai';

function fail(kind: ProviderKind, error: string): TestConnectionResult {
  return { ok: false, kind, error };
}

function ok(kind: ProviderKind, dimension?: number): TestConnectionResult {
  return dimension !== undefined ? { ok: true, kind, dimension } : { ok: true, kind };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // The AI SDK throws `APICallError` (from @ai-sdk/provider) on non-2xx
    // responses. Its `message` may omit the status code, so enrich with the
    // `statusCode` / `responseBody` fields when present for an actionable
    // error message (e.g. "401 — unauthorized").
    const apiErr = err as Error & { statusCode?: number; responseBody?: string };
    const parts: string[] = [err.message];
    if (typeof apiErr.statusCode === 'number') {
      parts.push(`HTTP ${apiErr.statusCode}`);
    }
    if (apiErr.responseBody) {
      parts.push(apiErr.responseBody.slice(0, 200));
    }
    return parts.join(' — ');
  }
  return String(err);
}

/**
 * Run a live round-trip test against a provider configuration without
 * persisting it. The test strategy depends on `kind` + `provider`:
 *
 * - **llm / chat + openai-compatible:** send a one-token completion request via
 *   the AI SDK and confirm a 2xx response.
 * - **llm / chat + fake:** no network call — the fake always responds.
 * - **embedding + openai-compatible:** embed a single probe string and report
 *   the returned vector's dimension (which may differ from the schema's fixed
 *   `EMBEDDING_DIM`).
 * - **embedding + fake:** no network call — reports the fake's dimension.
 * - **ocr + docling:** `GET {baseUrl}/health` — a lightweight reachability check
 *   that does not require uploading a file.
 * - **ocr + mistral:** `GET {baseUrl}/v1/models` with bearer auth — confirms the
 *   API key is valid and the host is reachable.
 * - **ocr + fake:** no network call.
 *
 * Any other provider/kind combination is reported as unsupported. Network and
 * server errors are caught and returned as `{ ok: false, error }` rather than
 * thrown, so the route handler can surface them directly to the UI.
 */
export async function testProviderConnection(
  input: TestConnectionInput,
): Promise<TestConnectionResult> {
  const { kind, provider, baseUrl, model, apiKey } = input;
  const trimmedBaseUrl = baseUrl.trim();
  const trimmedModel = model.trim();
  const trimmedKey = apiKey.trim();

  try {
    if (kind === 'llm' || kind === 'chat') {
      return await testLlm(provider, trimmedBaseUrl, trimmedModel, trimmedKey, kind);
    }
    if (kind === 'embedding') {
      return await testEmbedding(provider, trimmedBaseUrl, trimmedModel, trimmedKey);
    }
    if (kind === 'ocr') {
      return await testOcr(provider, trimmedBaseUrl, trimmedKey);
    }
    // Unreachable given the ProviderKind union, but TS narrowing leaves a
    // string here; guard explicitly so a future kind addition is loud.
    return fail(kind, `unsupported kind: ${kind}`);
  } catch (err) {
    return fail(kind, errorMessage(err));
  }
}

async function testLlm(
  provider: string,
  baseUrl: string,
  model: string,
  apiKey: string,
  kind: ProviderKind,
): Promise<TestConnectionResult> {
  if (provider === 'fake') {
    // Exercise the fake adapter so the path is exercised end-to-end.
    const llm = createFakeLlm();
    await llm.generateText({ prompt: 'ping' });
    return ok(kind);
  }
  if (provider !== 'openai-compatible') {
    return fail(kind, `unsupported llm provider for testing: ${provider}`);
  }
  if (!baseUrl) return fail(kind, 'base url is required for openai-compatible');
  if (!model) return fail(kind, 'model is required for openai-compatible');

  const client = createOpenAICompatible({
    name: 'openai-compat-test',
    baseURL: baseUrl,
    ...(apiKey ? { apiKey } : {}),
  });
  const chatModel = client.chatModel(model);
  // A tiny prompt keeps the round-trip cheap. We don't inspect the output — a
  // 2xx response from the SDK means the connection, auth, and model are valid.
  await generateText({
    model: chatModel,
    prompt: 'Reply with the single word: ok',
    abortSignal: AbortSignal.timeout(30_000),
  });
  return ok(kind);
}

async function testEmbedding(
  provider: string,
  baseUrl: string,
  model: string,
  apiKey: string,
): Promise<TestConnectionResult> {
  if (provider === 'fake') {
    const emb = createFakeEmbedding();
    const [vec] = await emb.embed(['probe']);
    return ok('embedding', vec.length);
  }
  if (provider !== 'openai-compatible') {
    return fail('embedding', `unsupported embedding provider for testing: ${provider}`);
  }
  if (!baseUrl) return fail('embedding', 'base url is required for openai-compatible');
  if (!model) return fail('embedding', 'model is required for openai-compatible');

  const client = createOpenAICompatible({
    name: 'openai-compat-embed-test',
    baseURL: baseUrl,
    ...(apiKey ? { apiKey } : {}),
  });
  const embedModel = client.textEmbeddingModel(model);
  // One probe string is enough to detect the dimension; we intentionally do
  // NOT enforce EMBEDDING_DIM here — the caller uses the reported dimension to
  // surface a mismatch to the user (the schema's column is fixed at 768).
  const { embeddings } = await embedMany({
    model: embedModel,
    values: ['connection probe'],
  });
  const first = embeddings[0];
  if (!first) return fail('embedding', 'embedding endpoint returned no vectors');
  return ok('embedding', first.length);
}

async function testOcr(
  provider: string,
  baseUrl: string,
  apiKey: string,
): Promise<TestConnectionResult> {
  if (provider === 'fake') {
    return ok('ocr');
  }
  if (provider === 'docling') {
    if (!baseUrl) return fail('ocr', 'base url is required for docling');
    const url = `${baseUrl.replace(/\/+$/, '')}/health`;
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return fail('ocr', `docling /health returned HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }
    return ok('ocr');
  }
  if (provider === 'mistral') {
    const base = baseUrl.trim() ? baseUrl.replace(/\/+$/, '') : MISTRAL_DEFAULT_BASE_URL;
    if (!apiKey) return fail('ocr', 'API key is required for mistral');
    const res = await fetch(`${base}/v1/models`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return fail('ocr', `mistral /v1/models returned HTTP ${res.status}${body ? ` — ${body}` : ''}`);
    }
    return ok('ocr');
  }
  return fail('ocr', `unsupported ocr provider for testing: ${provider}`);
}