import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createOpenAICompatLlm } from './openai-compat';
import { loadEnv } from '../../env';

// The AI SDK issues requests via global `fetch`. Stubbing `fetch` keeps the
// tests offline and lets us assert on the exact URL / headers / body the
// adapter produces without pulling undici's MockAgent (not hoisted under pnpm).
const BASE_URL = 'http://llm.test/v1';

type ChatMessage = { role: string; content: string };
type ChatBody = { model: string; messages: ChatMessage[] };

function chatCompletion(content: string): unknown {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1_700_000_000,
    model: 'test-model',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

type FetchCall = { url: string; init: RequestInit; body: ChatBody };

function stubFetch(body: unknown): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetchStub = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const raw = init.body;
    const parsed = typeof raw === 'string' ? (JSON.parse(raw) as ChatBody) : ({} as ChatBody);
    calls.push({ url, init, body: parsed });
    return jsonResponse(body);
  });
  vi.stubGlobal('fetch', fetchStub);
  return { calls };
}

/**
 * A fetch stub that never resolves on its own — it only settles when the
 * request's AbortSignal fires, rejecting with the signal's reason. Simulates
 * a stuck upstream (the Ollama "looks hung" case from the stability handoff).
 */
function hangingFetch(): { calls: number } {
  const state = { calls: 0 };
  const fetchStub = vi.fn((_input: RequestInfo | URL, init: RequestInit = {}) => {
    state.calls += 1;
    return new Promise<Response>((_resolve, reject) => {
      const signal = init.signal;
      const fail = (): void => reject(signal?.reason ?? new Error('aborted'));
      if (signal?.aborted) {
        fail();
        return;
      }
      signal?.addEventListener('abort', fail, { once: true });
    });
  });
  vi.stubGlobal('fetch', fetchStub);
  return state;
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const headers = init.headers;
  if (!headers) return undefined;
  const target = name.toLowerCase();
  if (headers instanceof Headers) {
    return headers.get(name) ?? undefined;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (key.toLowerCase() === target) return value;
    }
    return undefined;
  }
  const asRecord = headers as Record<string, string>;
  for (const [key, value] of Object.entries(asRecord)) {
    if (key.toLowerCase() === target) return value;
  }
  return undefined;
}

describe('openai-compat LLM provider', () => {
  beforeEach(() => {
    // Suppress AI SDK's advisory warning about responseFormat on generic
    // OpenAI-compatible servers — we're happy with the prompt-based fallback.
    (globalThis as { AI_SDK_LOG_WARNINGS?: boolean }).AI_SDK_LOG_WARNINGS = false;
    vi.unstubAllGlobals();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('generateText POSTs /chat/completions with Bearer auth when apiKey is set', async () => {
    const { calls } = stubFetch(chatCompletion('hello from mock'));

    const llm = createOpenAICompatLlm({
      baseUrl: BASE_URL,
      apiKey: 'sk-test-123',
      model: 'llama3.1:8b',
    });
    const out = await llm.generateText({ prompt: 'hi there' });

    expect(out.text).toBe('hello from mock');
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toBe('http://llm.test/v1/chat/completions');
    expect(call.init.method).toBe('POST');
    expect(headerValue(call.init, 'authorization')).toBe('Bearer sk-test-123');
    expect(call.body.model).toBe('llama3.1:8b');
    expect(call.body.messages.some((m) => m.content.includes('hi there'))).toBe(true);
  });

  it('omits Authorization header when apiKey is unset', async () => {
    const { calls } = stubFetch(chatCompletion('no-auth ok'));

    const llm = createOpenAICompatLlm({ baseUrl: BASE_URL, model: 'local-model' });
    const out = await llm.generateText({ prompt: 'ping' });

    expect(out.text).toBe('no-auth ok');
    expect(calls).toHaveLength(1);
    expect(headerValue(calls[0]!.init, 'authorization')).toBeUndefined();
  });

  it('generateStructured returns a typed object matching the schema', async () => {
    stubFetch(chatCompletion(JSON.stringify({ title: 'Alpha', count: 3 })));

    const llm = createOpenAICompatLlm({
      baseUrl: BASE_URL,
      apiKey: 'k',
      model: 'any',
    });
    const schema = z.object({ title: z.string(), count: z.number() });
    const out = await llm.generateStructured({ prompt: 'give me one', schema });

    expect(out.value.title).toBe('Alpha');
    expect(out.value.count).toBe(3);
  });

  it('generateText aborts the request once timeoutMs elapses', async () => {
    hangingFetch();
    const llm = createOpenAICompatLlm({ baseUrl: BASE_URL, model: 'm', timeoutMs: 40 });
    await expect(llm.generateText({ prompt: 'hi' })).rejects.toThrow();
  });

  it('generateStructured aborts on timeout instead of hanging forever', async () => {
    // A stuck server makes the primary generateObject call hang; the deadline
    // fires, and the prompt-based fallback sees an already-aborted signal so it
    // can't re-incur the full timeout. The call rejects rather than locking the
    // worker.
    hangingFetch();
    const llm = createOpenAICompatLlm({ baseUrl: BASE_URL, model: 'm', timeoutMs: 40 });
    const schema = z.object({ x: z.number() });
    await expect(llm.generateStructured({ prompt: 'x', schema })).rejects.toThrow();
  });

  it('generateStructured throws when the response fails Zod validation', async () => {
    stubFetch(chatCompletion(JSON.stringify({ title: 'Alpha', count: 'not-a-number' })));

    const llm = createOpenAICompatLlm({
      baseUrl: BASE_URL,
      apiKey: 'k',
      model: 'any',
    });
    const schema = z.object({ title: z.string(), count: z.number() });

    await expect(
      llm.generateStructured({ prompt: 'x', schema }),
    ).rejects.toThrow();
  });
});

describe('env + factory wiring for openai-compatible LLM', () => {
  it('loadEnv throws when LLM_PROVIDER=openai-compatible but LLM_BASE_URL is missing', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        LLM_PROVIDER: 'openai-compatible',
        LLM_MODEL: 'llama3.1:8b',
      }),
    ).toThrow(/LLM_BASE_URL/);
  });

  it('loadEnv throws when LLM_PROVIDER=openai-compatible but LLM_MODEL is missing', () => {
    expect(() =>
      loadEnv({
        APP_MODE: 'local',
        DATABASE_URL: 'postgres://x/y',
        LLM_PROVIDER: 'openai-compatible',
        LLM_BASE_URL: 'http://ollama:11434/v1',
      }),
    ).toThrow(/LLM_MODEL/);
  });

  it('loadEnv coerces LLM_TIMEOUT_MS to a number', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://ollama:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
      LLM_TIMEOUT_MS: '5000',
    });
    expect(env.LLM_TIMEOUT_MS).toBe(5000);
  });

  it('loadEnv accepts a fully-configured openai-compatible setup', () => {
    const env = loadEnv({
      APP_MODE: 'local',
      DATABASE_URL: 'postgres://x/y',
      LLM_PROVIDER: 'openai-compatible',
      LLM_BASE_URL: 'http://ollama:11434/v1',
      LLM_MODEL: 'llama3.1:8b',
    });
    expect(env.LLM_PROVIDER).toBe('openai-compatible');
    expect(env.LLM_BASE_URL).toBe('http://ollama:11434/v1');
    expect(env.LLM_MODEL).toBe('llama3.1:8b');
    expect(env.LLM_API_KEY).toBeUndefined();
  });
});
