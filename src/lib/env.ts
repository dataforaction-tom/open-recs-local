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
  // Optional LLM connection settings. Required only when LLM_PROVIDER === 'openai-compatible'
  // (enforced by a cross-field refinement on the discriminated union below). Leaving them
  // permissive here keeps the `fake` default usable with no extra env.
  LLM_BASE_URL: z.string().url().optional(),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().optional(),
  // Per-request timeout (ms) for the openai-compatible LLM. Guards against a
  // stuck local server (e.g. Ollama) locking a worker forever. Defaults to
  // 120s in the adapter when unset; raise it for slow large models.
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().optional(),
  // Optional dedicated streaming-chat config. When any CHAT_* var is unset it
  // falls back to the matching LLM_* var, so existing single-model deployments
  // keep working without change. This split exists because the structured-output
  // path (extract handler) and the streaming-chat path (`/api/chat-search`)
  // have very different model needs — a heavyweight extract model is overkill
  // for chat, and a tiny chat model often can't reliably emit valid JSON.
  CHAT_PROVIDER: z
    .enum(['fake', 'openai-compatible', 'anthropic', 'mistral'])
    .optional(),
  CHAT_BASE_URL: z.string().url().optional(),
  CHAT_API_KEY: z.string().optional(),
  CHAT_MODEL: z.string().optional(),
  EMBEDDING_PROVIDER: z
    .enum(['fake', 'openai-compatible', 'voyage'])
    .default('fake'),
  // Optional embedding connection settings. Required only when
  // EMBEDDING_PROVIDER === 'openai-compatible' (enforced by cross-field refinement).
  EMBEDDING_BASE_URL: z.string().url().optional(),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().optional(),
  OCR_PROVIDER: z
    .enum(['fake', 'mistral', 'docling', 'firecrawl', 'tesseract-pdf'])
    .default('fake'),
  // Required only when OCR_PROVIDER === 'docling' (cross-field refinement below).
  DOCLING_BASE_URL: z.string().url().optional(),
  // Required only when OCR_PROVIDER === 'mistral' (cross-field refinement below).
  // MISTRAL_BASE_URL is optional; the adapter falls back to https://api.mistral.ai
  // so that tests can override the host without mandating a value in every env.
  MISTRAL_API_KEY: z.string().optional(),
  MISTRAL_BASE_URL: z.string().url().optional(),
  STORAGE_PROVIDER: z.enum(['fs', 's3', 'fake']).default('fake'),
  // Base directory for the `fs` storage adapter. Relative paths resolve from
  // the process cwd. Required when STORAGE_PROVIDER=fs (cross-field refine).
  STORAGE_FS_PATH: z.string().optional(),
  // Email provider for password resets / magic links. Defaults to the console
  // fake so local-mode boots zero-config; `resend` requires RESEND_API_KEY
  // and RESEND_FROM (cross-field refinement below).
  EMAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().email().optional(),
};

// 32 chars of zeros isn't a real secret — it's only there so signed-URL
// tokens stop validating across machines if you copy them, while keeping
// `pnpm dev` zero-config in local mode. Hosted mode requires a real value.
const LOCAL_FILE_TOKEN_DEFAULT = 'local-dev-only-file-token-secret';

// Like LOCAL_FILE_TOKEN_DEFAULT, a non-secret stand-in so `pnpm dev` boots
// zero-config in local mode. Provider API keys encrypted with this dev key are
// only as safe as the local box. Hosted mode requires a real 32+ char value.
const LOCAL_PROVIDER_SECRET_DEFAULT = 'local-dev-only-provider-secret-key';

const local = z.object({
  APP_MODE: z.literal('local'),
  DATABASE_URL: databaseUrl,
  FILE_TOKEN_SECRET: z.string().min(32).default(LOCAL_FILE_TOKEN_DEFAULT),
  PROVIDER_SECRET_KEY: z.string().min(32).default(LOCAL_PROVIDER_SECRET_DEFAULT),
  ...providerSelectors,
});

const hosted = z.object({
  APP_MODE: z.literal('hosted'),
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  FILE_TOKEN_SECRET: z.string().min(32),
  PROVIDER_SECRET_KEY: z.string().min(32),
  ...providerSelectors,
});

// Cross-field refinement: if the caller selects the openai-compatible LLM adapter
// they must also supply a base URL and a model id. API key is optional because
// local servers (Ollama, LM Studio, vLLM) typically don't require auth.
export const envSchema = z
  .discriminatedUnion('APP_MODE', [local, hosted])
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER !== 'openai-compatible') return;
    if (!env.LLM_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LLM_BASE_URL'],
        message: 'LLM_BASE_URL is required when LLM_PROVIDER=openai-compatible',
      });
    }
    if (!env.LLM_MODEL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['LLM_MODEL'],
        message: 'LLM_MODEL is required when LLM_PROVIDER=openai-compatible',
      });
    }
  })
  .superRefine((env, ctx) => {
    // CHAT_PROVIDER=openai-compatible needs an effective base URL + model.
    // Fall back to the LLM_* values so a single-model deployment that sets
    // only LLM_* still satisfies the chat path.
    if (env.CHAT_PROVIDER !== 'openai-compatible') return;
    const effectiveBase = env.CHAT_BASE_URL ?? env.LLM_BASE_URL;
    const effectiveModel = env.CHAT_MODEL ?? env.LLM_MODEL;
    if (!effectiveBase) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CHAT_BASE_URL'],
        message:
          'CHAT_BASE_URL (or LLM_BASE_URL) is required when CHAT_PROVIDER=openai-compatible',
      });
    }
    if (!effectiveModel) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['CHAT_MODEL'],
        message:
          'CHAT_MODEL (or LLM_MODEL) is required when CHAT_PROVIDER=openai-compatible',
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.EMBEDDING_PROVIDER !== 'openai-compatible') return;
    if (!env.EMBEDDING_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMBEDDING_BASE_URL'],
        message:
          'EMBEDDING_BASE_URL is required when EMBEDDING_PROVIDER=openai-compatible',
      });
    }
    if (!env.EMBEDDING_MODEL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['EMBEDDING_MODEL'],
        message:
          'EMBEDDING_MODEL is required when EMBEDDING_PROVIDER=openai-compatible',
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.OCR_PROVIDER !== 'docling') return;
    if (!env.DOCLING_BASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['DOCLING_BASE_URL'],
        message: 'DOCLING_BASE_URL is required when OCR_PROVIDER=docling',
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.OCR_PROVIDER !== 'mistral') return;
    if (!env.MISTRAL_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['MISTRAL_API_KEY'],
        message: 'MISTRAL_API_KEY is required when OCR_PROVIDER=mistral',
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.STORAGE_PROVIDER !== 'fs') return;
    if (!env.STORAGE_FS_PATH) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['STORAGE_FS_PATH'],
        message: 'STORAGE_FS_PATH is required when STORAGE_PROVIDER=fs',
      });
    }
  })
  .superRefine((env, ctx) => {
    if (env.EMAIL_PROVIDER !== 'resend') return;
    if (!env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      });
    }
    if (!env.RESEND_FROM) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_FROM'],
        message: 'RESEND_FROM is required when EMAIL_PROVIDER=resend',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  // Coerce empty strings to undefined so `.optional()` fields behave consistently
  // whether the key is absent or present-but-empty. Docker compose's `env_file`
  // passes empty values through as "" which otherwise fails `.url()` parsing on
  // fields like LLM_BASE_URL even when the provider is `fake`.
  const normalized: Record<string, string | undefined> = {};
  for (const key of Object.keys(source)) {
    const value = source[key];
    normalized[key] = value === '' ? undefined : value;
  }
  const parsed = envSchema.safeParse(normalized);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Env validation failed:\n${issues}`);
  }
  return parsed.data;
}
