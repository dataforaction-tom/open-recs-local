import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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
    const llm = createFakeLlm({ structuredResponses: { x: { wrong: 'shape' } } });
    const schema = z.object({ required: z.string() });
    await expect(llm.generateStructured({ prompt: '', schema, key: 'x' })).rejects.toThrow();
  });

  it('falls back to <key>.recommendations.json in fixturesDir when no response registered', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'llm-fixtures-'));
    const payload = [
      { title: 'Rec A', full_text: 'Do A.', thematic_area_slug: 'governance' },
    ];
    await writeFile(path.join(tmp, 'sample.recommendations.json'), JSON.stringify(payload), 'utf8');

    const llm = createFakeLlm({ fixturesDir: tmp });
    const schema = z.array(
      z.object({ title: z.string(), full_text: z.string(), thematic_area_slug: z.string() }),
    );
    const out = await llm.generateStructured({ prompt: '', schema, key: 'sample' });
    expect(out.value).toHaveLength(1);
    expect(out.value[0]?.title).toBe('Rec A');
  });

  it('reads the shipped sample-report fixture by default (FIXTURES_DIR resolution)', async () => {
    const llm = createFakeLlm();
    const schema = z.array(
      z.object({ title: z.string(), full_text: z.string(), thematic_area_slug: z.string() }),
    );
    const out = await llm.generateStructured({ prompt: '', schema, key: 'sample-report' });
    expect(out.value.length).toBeGreaterThanOrEqual(2);
    expect(out.value[0]?.thematic_area_slug).toBe('governance');
  });

  it('throws a descriptive error when fixture file is malformed JSON', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'llm-fixtures-bad-'));
    const fixturePath = path.join(tmp, 'broken.recommendations.json');
    await writeFile(fixturePath, '{ not valid json', 'utf8');

    const llm = createFakeLlm({ fixturesDir: tmp });
    const schema = z.array(z.object({ title: z.string() }));
    await expect(
      llm.generateStructured({ prompt: '', schema, key: 'broken' }),
    ).rejects.toThrow(new RegExp(`${fixturePath.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}.*not valid JSON`));
  });

  it('throws when neither in-memory response nor fixture file exists', async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), 'llm-fixtures-empty-'));
    const llm = createFakeLlm({ fixturesDir: tmp });
    const schema = z.object({ x: z.string() });
    await expect(
      llm.generateStructured({ prompt: '', schema, key: 'missing' }),
    ).rejects.toThrow('fake LLM: no structured response registered for key="missing"');
  });
});
