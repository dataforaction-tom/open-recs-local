import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateObject, generateText } from 'ai';
import type {
  LlmProvider,
  LlmStructuredInput,
  LlmStructuredOutput,
  LlmTextInput,
  LlmTextOutput,
} from './types';

export type OpenAICompatLlmConfig = {
  /** Base URL of an OpenAI-compatible server, e.g. `http://ollama:11434/v1`. */
  baseUrl: string;
  /** Optional bearer token. Local servers (Ollama, LM Studio, vLLM) often omit this. */
  apiKey?: string;
  /** Model id to request, e.g. `llama3.1:8b` or `gpt-4o-mini`. */
  model: string;
};

/**
 * Real LLM adapter backed by any OpenAI-compatible Chat Completions endpoint.
 * Covers Ollama, LM Studio, vLLM, OpenAI itself, and anything else that speaks
 * the `/v1/chat/completions` dialect. Structured output flows through the AI
 * SDK's `generateObject`, which negotiates JSON schema / tool-call modes and
 * falls back to prompt-based JSON for servers that don't support them.
 */
export function createOpenAICompatLlm(config: OpenAICompatLlmConfig): LlmProvider {
  // `createOpenAICompatible` is the generic, provider-agnostic client. We keep
  // the name stable ('openai-compat') so telemetry / logs don't leak the
  // specific downstream vendor.
  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL: config.baseUrl,
    // Only attach the header when the caller actually supplied a key — passing
    // `undefined` would still cause the SDK to set `Authorization: Bearer
    // undefined` on some versions.
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
  const model = client.chatModel(config.model);

  return {
    name: 'openai-compat',
    async generateText(input: LlmTextInput): Promise<LlmTextOutput> {
      const { text } = await generateText({
        model,
        prompt: input.prompt,
        ...(input.system !== undefined ? { system: input.system } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      });
      return { text };
    },
    async generateStructured<T>(
      input: LlmStructuredInput<T>,
    ): Promise<LlmStructuredOutput<T>> {
      // The `key` field on the input is only meaningful to the fake provider's
      // fixture lookup — ignore it here.
      const { object } = await generateObject({
        model,
        prompt: input.prompt,
        schema: input.schema,
        ...(input.system !== undefined ? { system: input.system } : {}),
      });
      // `generateObject` already validates against the schema and throws a
      // `NoObjectGeneratedError` (or zod error) on mismatch, so the cast is safe.
      return { value: object as T };
    },
  };
}
