import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';
import type { Env } from '../../env';

/**
 * Returns an AI-SDK chat model for streaming. The non-streaming LlmProvider
 * interface only exposes generateText/generateStructured, so chat-search uses
 * this helper directly. Returns null when no streaming-capable provider is
 * configured (currently only the openai-compatible adapter qualifies).
 */
export function getChatModel(env: Env): LanguageModel | null {
  if (env.LLM_PROVIDER !== 'openai-compatible') return null;
  if (!env.LLM_BASE_URL || !env.LLM_MODEL) return null;
  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL: env.LLM_BASE_URL,
    ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
  });
  return client.chatModel(env.LLM_MODEL);
}
