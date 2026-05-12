import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LlmProvider, LlmStructuredInput, LlmStructuredOutput, LlmTextInput, LlmTextOutput } from './types';

export type FakeLlmConfig = {
  /** Map of key → object, used by generateStructured. Wins over fixture files. */
  structuredResponses?: Record<string, unknown>;
  /**
   * Directory holding fixture JSON files. Two filename conventions:
   *   - `<stem>.metadata.json`        — Pass 1 source-metadata fixture
   *   - `<stem>.recommendations.json` — Pass 2 recommendations fixture
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

/**
 * Map a structured-call key onto a fixture file path. Keys ending in
 * `:metadata` route to `<stem>.metadata.json`; all other keys route to
 * `<stem>.recommendations.json`. The suffix is the only signal: the
 * handler controls it explicitly per pass.
 */
function fixturePathFor(fixturesDir: string, key: string): string {
  if (key.endsWith(':metadata')) {
    const stem = key.slice(0, -':metadata'.length);
    return path.join(fixturesDir, `${stem}.metadata.json`);
  }
  return path.join(fixturesDir, `${key}.recommendations.json`);
}

async function loadFixtureResponse(fixturesDir: string, key: string): Promise<unknown | undefined> {
  const fixturePath = fixturePathFor(fixturesDir, key);
  let raw: string;
  try {
    raw = await readFile(fixturePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
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
        // Fallback: derive a fixture path from the key.
        raw = await loadFixtureResponse(resolveFixturesDir(config), key);
      }
      if (raw === undefined) {
        throw new Error(`fake LLM: no structured response registered for key="${key}"`);
      }
      const parsed = input.schema.safeParse(raw);
      if (parsed.success) return { value: parsed.data };
      throw parsed.error;
    },
  };
}
