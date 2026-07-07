import { EMBEDDING_DIM, type ProviderKind } from '../db/schema';
import { testProviderConnection, type TestConnectionInput } from './test-connection';

/**
 * Thrown by {@link assertEmbeddingDimension} when a live embedding probe returns
 * vectors whose dimension doesn't match the schema's fixed {@link EMBEDDING_DIM}.
 *
 * The message is written for an admin UI: it names both dimensions and explains
 * why re-embedding isn't a one-click fix (the pgvector column is fixed-width).
 */
export class EmbeddingDimensionMismatchError extends Error {
  readonly actual: number;
  readonly expected: number;
  constructor(actual: number, expected: number) {
    super(
      `model returns ${actual}-dim vectors; this instance is fixed at ${expected} — ` +
        `re-embedding isn't supported yet`,
    );
    this.name = 'EmbeddingDimensionMismatchError';
    this.actual = actual;
    this.expected = expected;
  }
}

/**
 * Pre-save guard for embedding provider configs. Embeds a probe string via the
 * submitted (pre-save) configuration using {@link testProviderConnection} and
 * throws {@link EmbeddingDimensionMismatchError} when the returned dimension
 * doesn't match {@link EMBEDDING_DIM}.
 *
 * - Non-embedding kinds are a no-op (the guard only runs for embeddings).
 * - A connection failure (ok=false) is surfaced as an `Error` carrying the
 *   underlying message — the save is blocked rather than silently persisted
 *   with an unreachable / misconfigured endpoint.
 */
export async function assertEmbeddingDimension(
  input: TestConnectionInput,
): Promise<void> {
  // Only embeddings have a fixed-width pgvector column to protect.
  const kind: ProviderKind = input.kind;
  if (kind !== 'embedding') return;

  const result = await testProviderConnection(input);
  if (!result.ok) {
    throw new Error(result.error ?? 'embedding connection test failed');
  }
  // The fake / openai-compatible paths always report a dimension on success.
  // If a future path doesn't, treat the absence as a failure rather than
  // silently letting an unknown-width model through.
  if (result.dimension === undefined) {
    throw new Error('embedding connection test did not report a dimension');
  }
  if (result.dimension !== EMBEDDING_DIM) {
    throw new EmbeddingDimensionMismatchError(result.dimension, EMBEDDING_DIM);
  }
}