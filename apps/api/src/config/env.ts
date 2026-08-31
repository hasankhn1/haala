import path from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Load env from the monorepo root first, then any app-local override.
// dotenv does not overwrite already-set vars, so root wins when both exist.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });

/**
 * Treat a set-but-empty variable as absent.
 *
 * A hosting dashboard has no way to express "unset" — Railway and friends send
 * `KEY=`, which reaches us as an empty string. Without this, an optional URL
 * left blank fails `.url()` and the whole process refuses to boot over a
 * feature nobody asked for.
 */
const blankAsUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().startsWith('/').default('/api/v1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  CORS_ORIGINS: z.string().default('*'),

  PAYMENT_ONLINE_PROVIDER: z.string().default('stub'),

  // Safepay. Optional so a dev environment boots on the stub provider; the
  // provider itself fails loudly if it's selected without credentials, which is
  // better than silently taking payments nowhere.
  SAFEPAY_API_KEY: blankAsUndefined(z.string().optional()),
  SAFEPAY_SECRET_KEY: blankAsUndefined(z.string().optional()),
  SAFEPAY_WEBHOOK_SECRET: blankAsUndefined(z.string().optional()),
  SAFEPAY_BASE_URL: z.string().url().default('https://sandbox.api.getsafepay.com'),
  SAFEPAY_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),

  // Cloudflare R2, for brand-uploaded images. Optional as a set: an environment
  // without them boots fine and the upload endpoints answer 503, which is
  // better than a dev machine refusing to start over a feature it isn't using.
  R2_ACCOUNT_ID: blankAsUndefined(z.string().optional()),
  R2_ACCESS_KEY_ID: blankAsUndefined(z.string().optional()),
  R2_SECRET_ACCESS_KEY: blankAsUndefined(z.string().optional()),
  R2_BUCKET: blankAsUndefined(z.string().optional()),
  /**
   * Where the objects are readable from — an `https://pub-….r2.dev` address or
   * a custom domain, set once public access is switched on for the bucket.
   *
   * Deliberately optional and separate from the credentials above, because the
   * two are enabled independently: uploads work the moment the bucket exists,
   * while public reads need a second switch in the Cloudflare dashboard. Left
   * unset, images are served through the API instead, which is slower but not
   * broken.
   */
  R2_PUBLIC_BASE_URL: blankAsUndefined(z.string().url().optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message — misconfigured env should never boot.
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`\n✖ Invalid environment configuration:\n${issues}\n`);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
