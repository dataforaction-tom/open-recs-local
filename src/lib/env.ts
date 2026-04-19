import { z } from 'zod';

const databaseUrl = z
  .string()
  .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
    message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
  });

const local = z.object({
  APP_MODE: z.literal('local'),
  DATABASE_URL: databaseUrl,
});

const hosted = z.object({
  APP_MODE: z.literal('hosted'),
  DATABASE_URL: databaseUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
});

const schema = z.discriminatedUnion('APP_MODE', [local, hosted]);

export type Env = z.infer<typeof schema>;

export function loadEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Env validation failed:\n${issues}`);
  }
  return parsed.data;
}
