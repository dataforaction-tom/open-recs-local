import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createFakeLlm } from './fake';

describe('fake LLM provider', () => {
  it('generateText echoes prompt with a marker', async () => {
    const llm = createFakeLlm();
    const out = await llm.generateText({ prompt: 'hello world' });
    expect(out.text).toContain('hello world');
    expect(out.text).toContain('[fake-llm]');
  });

  it('generateStructured validates against the provided zod schema', async () => {
    const llm = createFakeLlm({
      structuredResponses: {
        'extract-recs': { recommendations: [{ title: 't', body: 'b' }] },
      },
    });
    const schema = z.object({
      recommendations: z.array(z.object({ title: z.string(), body: z.string() })),
    });
    const out = await llm.generateStructured({
      prompt: 'anything',
      schema,
      key: 'extract-recs',
    });
    expect(out.value.recommendations[0]?.title).toBe('t');
  });

  it('generateStructured throws on schema mismatch', async () => {
    const llm = createFakeLlm({ structuredResponses: { 'x': { wrong: 'shape' } } });
    const schema = z.object({ required: z.string() });
    await expect(
      llm.generateStructured({ prompt: '', schema, key: 'x' }),
    ).rejects.toThrow();
  });
});
