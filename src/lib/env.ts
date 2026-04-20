import { z } from 'zod';

const databaseUrl = z
  .string()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  });

// Provider selectors. Only `fake` (and `fs` for storage) are recognised enum values
// for Phase 2+ adapters; the factory decides which are actually wired in a given phase.
const providerSelectors = {
  LLM_PROVIDER: z
    .enum(['fake', 'openai-compatible', 'anthropic', 'mistral'])
    .default('fake'),
  EMBEDDING_PROVIDER: z
    .enum(['fake', 'openai-compatible', 'voyage'])
    .default('fake'),
  OCR_PROVIDER: z
    .enum(['fake', 'mistral', 'docling', 'firecrawl', 'tesseract-pdf'])
    .default('fake'),
  STORAGE_PROVIDER: z.enum(['fs', 's3', 'fake']).default('fake'),
};

const local = z.object({
  APP_MODE: z.literal('local'),
  DATABASE_URL: databaseUrl,
  ...providerSelectors,
});

const hosted = z.object({
  APP_MODE: z.literal('hosted'),
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  ...providerSelectors,
});

export const envSchema = z.discriminatedUnion('APP_MODE', [local, hosted]);

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Env validation failed:\n${issues}`);
  }
  return parsed.data;
}
