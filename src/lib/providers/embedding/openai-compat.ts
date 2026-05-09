import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { embedMany } from 'ai';
import { EMBEDDING_DIM } from '../../db/schema';
import type { EmbeddingProvider } from './types';

export type OpenAICompatEmbeddingConfig = {
  /** Base URL of an OpenAI-compatible server, e.g. `http://ollama:11434/v1`. */
  baseUrl: string;
  /** Optional bearer token. Local servers (Ollama, LM Studio, vLLM) often omit this. */
  apiKey?: string;
  /** Embedding model id, e.g. `nomic-embed-text` or `text-embedding-3-small`. */
  model: string;
};

/**
 * Real embedding adapter backed by any OpenAI-compatible `/v1/embeddings`
 * endpoint (Ollama, LM Studio, vLLM, OpenAI, etc.).
 *
 * Validates the returned vector dimension at the adapter boundary: the DB
 * column is pinned to {@link EMBEDDING_DIM} (768) and silently accepting a
 * differently-sized vector would fail deep in Drizzle / pgvector with a
 * much less obvious error.
 */
export function createOpenAICompatEmbedding(
  config: OpenAICompatEmbeddingConfig,
): EmbeddingProvider {
  const client = createOpenAICompatible({
    name: 'openai-compat-embed',
    baseURL: config.baseUrl,
    // Only attach the key when supplied — otherwise some SDK versions stringify
    // `undefined` into the Authorization header.
    ...(config.apiKey ? { apiKey: config.apiKey } : {}),
  });
  const model = client.textEmbeddingModel(config.model);

  return {
    name: 'openai-compat',
    model: config.model,
    dimensions: EMBEDDING_DIM,
    async embed(texts: string[]): Promise<number[][]> {
      const { embeddings } = await embedMany({ model, values: texts });
      // Dimension guard: fail loud if the server returns vectors of a different
      // size than the schema expects. Without this the error surfaces as a
      // pgvector insert failure far from the real cause.
      for (let i = 0; i < embeddings.length; i += 1) {
        const vec = embeddings[i]!;
        if (vec.length !== EMBEDDING_DIM) {
          throw new Error(
            `embedding dimension mismatch: expected ${EMBEDDING_DIM}, got ${vec.length} (model=${config.model}, index=${i})`,
          );
        }
      }
      return embeddings;
    },
  };
}
