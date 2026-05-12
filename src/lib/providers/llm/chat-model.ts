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
 */
export function getChatModel(env: Env): LanguageModel | null {
  const provider = env.CHAT_PROVIDER ?? env.LLM_PROVIDER;
  if (provider !== 'openai-compatible') return null;

  const baseURL = env.CHAT_BASE_URL ?? env.LLM_BASE_URL;
  const apiKey = env.CHAT_API_KEY ?? env.LLM_API_KEY;
  const model = env.CHAT_MODEL ?? env.LLM_MODEL;
  if (!baseURL || !model) return null;

  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL,
    ...(apiKey ? { apiKey } : {}),
  });
  return client.chatModel(model);
}
