import type { EmbeddingProvider } from '../providers/embedding/types';
import type { RepoContext } from '../repositories/types';
import { defaultQueryEmbeddingCache, type QueryEmbeddingCache } from './query-embedding-cache';
import {
  runRecommendationsKeyword,
  runRecommendationsRrf,
  type RrfRow,
  type SearchFilters,
} from './search-sql';

export type SearchMode = 'hybrid' | 'keyword';

export type SearchRecsInput = {
  ctx: RepoContext;
  q: string;
  filters?: SearchFilters;
  limit?: number;
  mode: SearchMode;
};

export type SearchRecsDeps = {
  embedding?: EmbeddingProvider;
  cache?: QueryEmbeddingCache;
};

export async function searchRecommendations(
  input: SearchRecsInput,
  deps: SearchRecsDeps = {},
): Promise<RrfRow[]> {
  const { ctx, q, filters, limit, mode } = input;

  if (mode === 'keyword') {
    return runRecommendationsKeyword(ctx, { q, ...(limit !== undefined ? { limit } : {}), ...(filters ? { filters } : {}) });
  }

  // Design doc :124 — "queries degrade gracefully to keyword-only" when the
  // embedding provider is disabled. Warn once so operators can spot misconfig.
  if (!deps.embedding) {
    console.warn(
      'searchRecommendations: hybrid mode requested without embedding provider; degrading to keyword-only',
    );
    return runRecommendationsKeyword(ctx, { q, ...(limit !== undefined ? { limit } : {}), ...(filters ? { filters } : {}) });
  }

  const embedding = deps.embedding;
  const loader = async (): Promise<number[]> => {
    const result = await embedding.embed([q]);
    const first = result[0];
    if (!first) throw new Error('embedding provider returned no vector');
    return first;
  };

  const cache = deps.cache ?? defaultQueryEmbeddingCache;
  const queryEmbedding = await cache.get(embedding.model, q, loader);

  return runRecommendationsRrf(ctx, {
    q,
    queryEmbedding,
    ...(limit !== undefined ? { limit } : {}),
    ...(filters ? { filters } : {}),
  });
}
