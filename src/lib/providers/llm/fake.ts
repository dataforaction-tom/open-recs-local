import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput, LlmTextInput, LlmTextOutput } from './types';

export type FakeLlmConfig = {
  /** Map of key → object, used by generateStructured. Wins over fixture files. */
  structuredResponses?: Record<string, unknown>;
  /**
   * Directory holding fixture `<key>.recommendations.json` files used as a
   * fallback when `structuredResponses` has no entry for the key.
   * Resolution order: explicit config → `FIXTURES_DIR` env → `<cwd>/fixtures/sources`.
   */
  fixturesDir?: string;
};

function resolveFixturesDir(config: FakeLlmConfig): string {
  if (config.fixturesDir) return config.fixturesDir;
  const fromEnv = process.env.FIXTURES_DIR;
  if (fromEnv && fromEnv.length > 0) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'fixtures/sources');
}

async function loadFixtureResponse(fixturesDir: string, key: string): Promise<unknown | undefined> {
  const fixturePath = path.join(fixturesDir, `${key}.recommendations.json`);
  let raw: string;
  try {
    raw = await readFile(fixturePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err; // permission/IO errors should surface
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`fake LLM: fixture at ${fixturePath} is not valid JSON: ${(err as Error).message}`);
  }
}

export function createFakeLlm(config: FakeLlmConfig = {}): LlmProvider {
  const responses = config.structuredResponses ?? {};
  return {
    name: 'fake',
    async generateText(input: LlmTextInput): Promise<LlmTextOutput> {
      return { text: `[fake-llm] ${input.prompt}` };
    },
    async generateStructured<T>(input: LlmStructuredInput<T>): Promise<LlmStructuredOutput<T>> {
      const key = input.key ?? 'default';
      let raw: unknown = responses[key];
      if (raw === undefined) {
        // Fallback: treat `key` as a source stem and read the matching recs fixture.
        // Resolved per-call so tests can mutate FIXTURES_DIR between constructions.
        raw = await loadFixtureResponse(resolveFixturesDir(config), key);
      }
      if (raw === undefined) {
        throw new Error(`fake LLM: no structured response registered for key="${key}"`);
      }
      // Fixture-shape reconciliation: Task 2 fixtures on disk are flat arrays
      // (`[{ title, full_text, ... }]`) but Task 9's ExtractionSchema wraps
      // the array under `{ recommendations: [...] }`. Rather than churning
      // the fixtures, if the caller's schema rejects the raw value AND the
      // raw value is an array, retry once with the array wrapped.
      const first = input.schema.safeParse(raw);
      if (first.success) return { value: first.data };
      if (Array.isArray(raw)) {
        const wrapped = input.schema.safeParse({ recommendations: raw });
        if (wrapped.success) return { value: wrapped.data };
      }
      // Re-throw the original zod error so schema-violation failures still
      // surface with a useful message.
      throw first.error;
    },
  };
}
