import type { Env } from '../env';
import type { AuthProvider } from './auth/types';
import type { LlmProvider } from './llm/types';
import type { EmbeddingProvider } from './embedding/types';
import type { OcrProvider } from './ocr/types';
import type { StorageProvider } from './storage/types';
import { localAuth } from './auth/local';
import { createFakeLlm } from './llm/fake';
import { createFakeEmbedding } from './embedding/fake';
import { createFakeOcr } from './ocr/fake';
import { createFakeStorage } from './storage/fake';

export type Providers = {
  auth: AuthProvider;
  llm: LlmProvider;
  embedding: EmbeddingProvider;
  ocr: OcrProvider;
  storage: StorageProvider;
};

function notWired(kind: string, value: string): never {
  throw new Error(`provider ${kind}=${value} is not wired yet`);
}

function selectAuth(env: Env): AuthProvider {
  if (env.APP_MODE === 'local') return localAuth;
  throw new Error('hosted auth is not wired yet');
}

function selectLlm(env: Env): LlmProvider {
  switch (env.LLM_PROVIDER) {
    case 'fake':
      return createFakeLlm();
    default:
      return notWired('llm', env.LLM_PROVIDER);
  }
}

function selectEmbedding(env: Env): EmbeddingProvider {
  switch (env.EMBEDDING_PROVIDER) {
    case 'fake':
      return createFakeEmbedding();
    default:
      return notWired('embedding', env.EMBEDDING_PROVIDER);
  }
}

function selectOcr(env: Env): OcrProvider {
  switch (env.OCR_PROVIDER) {
    case 'fake':
      return createFakeOcr();
    default:
      return notWired('ocr', env.OCR_PROVIDER);
  }
}

function selectStorage(env: Env): StorageProvider {
  switch (env.STORAGE_PROVIDER) {
    case 'fake':
      return createFakeStorage();
    default:
      return notWired('storage', env.STORAGE_PROVIDER);
  }
}

export function createProviders(env: Env): Providers {
  return {
    auth: selectAuth(env),
    llm: selectLlm(env),
    embedding: selectEmbedding(env),
    ocr: selectOcr(env),
    storage: selectStorage(env),
  };
}
