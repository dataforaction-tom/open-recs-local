import { createHash } from 'node:crypto';
import type { EmbeddingProvider } from './types';

export type FakeEmbeddingConfig = {
  dimensions?: number;
  model?: string;
};

export function createFakeEmbedding(config: FakeEmbeddingConfig = {}): EmbeddingProvider {
  const dimensions = config.dimensions ?? 768;
  const model = config.model ?? 'fake-embedding-v0';
  return {
    name: 'fake',
    model,
    dimensions,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => hashToUnitVector(text, dimensions));
    },
  };
}

// Deterministic: chain sha256(text || counter) to produce enough bytes for `dim` floats,
// map each 4-byte window to a signed int in [-1, 1], then L2-normalise.
function hashToUnitVector(text: string, dim: number): number[] {
  const bytesNeeded = dim * 4;
  const chunks: Buffer[] = [];
  let produced = 0;
  let counter = 0;
  while (produced < bytesNeeded) {
    const h = createHash('sha256');
    h.update(text);
    h.update(Buffer.from([counter & 0xff, (counter >> 8) & 0xff]));
    const chunk = h.digest();
    chunks.push(chunk);
    produced += chunk.length;
    counter += 1;
  }
  const buf = Buffer.concat(chunks, bytesNeeded);
  const raw: number[] = [];
  for (let i = 0; i < dim; i += 1) {
    const n = buf.readInt32BE(i * 4);
    raw.push(n / 2_147_483_648);
  }
  const norm = Math.sqrt(raw.reduce((acc, x) => acc + x * x, 0)) || 1;
  return raw.map((x) => x / norm);
}
