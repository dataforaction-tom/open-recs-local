import { describe, expect, it } from 'vitest';
import { createFakeEmbedding } from './fake';

describe('fake embedding provider', () => {
  it('returns one vector per input text, each of default dimension 768', async () => {
    const emb = createFakeEmbedding();
    const out = await emb.embed(['a', 'b']);
    expect(out).toHaveLength(2);
    expect(out[0]).toHaveLength(768);
    expect(out[1]).toHaveLength(768);
  });

  it('is deterministic — same text produces an identical vector', async () => {
    const emb = createFakeEmbedding();
    const [v1] = await emb.embed(['hello']);
    const [v2] = await emb.embed(['hello']);
    expect(v1).toEqual(v2);
  });

  it('produces unit-length vectors (sum of squares ≈ 1)', async () => {
    const emb = createFakeEmbedding();
    const [v] = await emb.embed(['any text']);
    const sumSq = v!.reduce((acc, n) => acc + n * n, 0);
    expect(sumSq).toBeGreaterThan(0.999);
    expect(sumSq).toBeLessThan(1.001);
  });

  it('different texts produce different vectors', async () => {
    const emb = createFakeEmbedding();
    const [a] = await emb.embed(['alpha']);
    const [b] = await emb.embed(['beta']);
    expect(a).not.toEqual(b);
  });

  it('dimensions override is respected', async () => {
    const emb = createFakeEmbedding({ dimensions: 16 });
    const [v] = await emb.embed(['x']);
    expect(v).toHaveLength(16);
    expect(emb.dimensions).toBe(16);
  });
});
