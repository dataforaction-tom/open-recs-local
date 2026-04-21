import { loadEnv } from '@/lib/env';
import { listModels } from '@/lib/providers/llm/discover';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function jsonError(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * GET /api/providers/llm/models
 *
 * Proxies the configured LLM server's `/v1/models` endpoint. Useful for the UI
 * model picker and as a reachability health-check. Only supported for the
 * `openai-compatible` provider — other providers (fake, future anthropic /
 * mistral adapters) don't speak this dialect.
 *
 * No caching: model lists on local Ollama change whenever the user pulls a
 * new tag, and the remote-OpenAI case is rare enough that a per-request
 * round-trip is fine. Revisit in Phase 3+ if latency bites.
 */
export async function GET(): Promise<Response> {
  const env = loadEnv();

  if (env.LLM_PROVIDER !== 'openai-compatible') {
    return jsonError(
      400,
      `model discovery only available for openai-compatible provider, got ${env.LLM_PROVIDER}`,
    );
  }
  if (!env.LLM_BASE_URL) {
    // Should be unreachable — the env schema's cross-field refinement enforces
    // this — but we guard anyway so a future schema change can't silently
    // produce a confusing 502.
    return jsonError(500, 'LLM_BASE_URL is not configured');
  }

  try {
    const models = await listModels(env.LLM_BASE_URL, env.LLM_API_KEY);
    return new Response(
      JSON.stringify({
        provider: 'openai-compatible',
        baseUrl: env.LLM_BASE_URL,
        models,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(502, `failed to reach LLM models endpoint: ${message}`);
  }
}
