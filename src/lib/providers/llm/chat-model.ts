import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Env } from '../../env';

/**
 * Returns an AI-SDK chat model for streaming. The non-streaming LlmProvider
 * interface only exposes generateText/generateStructured, so chat-search uses
 * this helper directly. Returns null when no streaming-capable provider is
 * configured (currently only the openai-compatible adapter qualifies).
 *
 * Config resolution prefers the dedicated `CHAT_*` env vars and falls back
 * to the matching `LLM_*` values. This split lets an operator run extract
 * against a heavier structured-output model (e.g. `llama3.1:8b`) and chat
 * against a smaller streaming model (e.g. `qwen2.5:0.5b`) — useful in CI
 * where the chat path needs a real streaming endpoint but extract is mocked
 * by fixtures.
 *
 * Accepts a merged config object — typically the output of
 * `loadProviderConfig(db, env)` in `src/lib/providers/config.ts`, which
 * overlays DB-stored `provider_settings` rows on top of the raw env. That
 * makes DB-driven chat model selection work on the web read path (the
 * `/api/chat-search` route). A caller that only has the raw env can still
 * pass it directly; the shape is identical.
 */
export function getChatModelFromConfig(config: Env): LanguageModel | null {
  const provider = config.CHAT_PROVIDER ?? config.LLM_PROVIDER;
  if (provider !== 'openai-compatible') return null;

  const baseURL = config.CHAT_BASE_URL ?? config.LLM_BASE_URL;
  const apiKey = config.CHAT_API_KEY ?? config.LLM_API_KEY;
  const model = config.CHAT_MODEL ?? config.LLM_MODEL;
  if (!baseURL || !model) return null;

  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  });
  return client.chatModel(model);
}

/**
 * Backwards-compatible wrapper for callers that only have the raw `Env`
 * (no DB access). Delegates to {@link getChatModelFromConfig}. New callers
 * should prefer `getChatModelFromConfig` with a merged config from
 * `loadProviderConfig()` so DB-stored provider settings take effect.
 */
export function getChatModel(env: Env): LanguageModel | null {
  return getChatModelFromConfig(env);
}