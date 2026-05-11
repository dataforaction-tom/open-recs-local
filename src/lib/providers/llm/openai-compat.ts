import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { z } from 'zod';
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
 * Strip a ```...``` (or ```json…```) code fence around model output. Llama
 * and friends often wrap JSON in a fence even when asked not to.
 */
function unwrapCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return (fence?.[1] ?? trimmed).trim();
}

/**
 * Real LLM adapter backed by any OpenAI-compatible Chat Completions endpoint.
 * Covers Ollama, LM Studio, vLLM, OpenAI itself, and anything else that speaks
 * the `/v1/chat/completions` dialect.
 *
 * Structured output: we used to delegate to the AI SDK's `generateObject`,
 * but Ollama + Llama don't reliably honour the openai-compat `response_format`
 * for arbitrary JSON Schemas — the SDK warns and the response fails Zod
 * validation roughly 1-in-3 attempts. Instead we ask for JSON in the prompt,
 * unwrap any code fence the model added, parse, and validate against the
 * caller-supplied Zod schema. Retry once on failure since these models are
 * not perfectly stable on first generation.
 */
export function createOpenAICompatLlm(config: OpenAICompatLlmConfig): LlmProvider {
  const client = createOpenAICompatible({
    name: 'openai-compat',
    baseURL: config.baseUrl,
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
      const baseSystem = input.system ?? '';
      const jsonInstruction =
        'Respond with raw JSON only. No prose, no explanations, no Markdown code fences. ' +
        'The JSON must match the schema implied by the user prompt.';
      const system = baseSystem ? `${baseSystem}\n\n${jsonInstruction}` : jsonInstruction;

      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { text } = await generateText({
          model,
          prompt: input.prompt,
          system,
        });
        const unwrapped = unwrapCodeFence(text);
        let parsed: unknown;
        try {
          parsed = JSON.parse(unwrapped);
        } catch (err) {
          lastErr = new Error(
            `openai-compat structured: model output was not valid JSON: ${(err as Error).message}`,
          );
          continue;
        }
        // Try the parsed shape first. Small open models often return a
        // bare top-level array when the schema's single field is an array
        // (e.g. `[…]` instead of `{recommendations: […]}`); fall back to
        // wrapping the value under the schema's first field name.
        const schema = input.schema as z.ZodType<T>;
        let result = schema.safeParse(parsed);
        if (!result.success && Array.isArray(parsed)) {
          const fieldName = topLevelArrayField(schema);
          if (fieldName) result = schema.safeParse({ [fieldName]: parsed });
        }
        if (result.success) return { value: result.data };
        lastErr = new Error(
          `openai-compat structured: response failed schema validation: ${result.error.message}`,
        );
      }
      throw lastErr instanceof Error ? lastErr : new Error('openai-compat structured: unknown failure');
    },
  };
}

/**
 * If the supplied schema is a `z.object({ x: z.array(...) })` with exactly
 * one top-level field that is an array, return the field name. Used by
 * `generateStructured` to recover from models that return a bare array
 * when the schema is single-field-array shaped. Returns null otherwise.
 */
function topLevelArrayField(schema: z.ZodType<unknown>): string | null {
  const def = (schema as unknown as { _def?: { type?: string; shape?: () => Record<string, unknown> } })._def;
  if (!def || def.type !== 'object' || typeof def.shape !== 'function') return null;
  const shape = def.shape();
  const keys = Object.keys(shape);
  if (keys.length !== 1) return null;
  const only = keys[0]!;
  const fieldDef = (shape[only] as unknown as { _def?: { type?: string } })._def;
  return fieldDef?.type === 'array' ? only : null;
}
