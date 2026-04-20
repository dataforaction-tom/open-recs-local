import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput, LlmTextInput, LlmTextOutput } from './types';

export type FakeLlmConfig = {
  /** Map of key → object, used by generateStructured. */
  structuredResponses?: Record<string, unknown>;
};

export function createFakeLlm(config: FakeLlmConfig = {}): LlmProvider {
  const responses = config.structuredResponses ?? {};
  return {
    name: 'fake',
    async generateText(input: LlmTextInput): Promise<LlmTextOutput> {
      return { text: `[fake-llm] ${input.prompt}` };
    },
    async generateStructured<T>(input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>> {
      const key = input.key ?? 'default';
      const raw = responses[key];
      if (raw === undefined) {
        throw new Error(`fake LLM: no structured response registered for key="${key}"`);
      }
      const value = input.schema.parse(raw);
      return { value };
    },
  };
}
