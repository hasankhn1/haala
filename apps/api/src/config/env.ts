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

  // ── Safepay ──────────────────────────────────────────────────────────────
  // All optional: an instance taking COD only is a legitimate deployment, so a
  // missing key fails at the point of use with a message naming it rather than
  // refusing to boot. The provider is loud when it is selected without them.

  /** Public key (`sec_…`). Goes in request bodies as `merchant_api_key`. */
  SAFEPAY_API_KEY: blankAsUndefined(z.string().optional()),
  /** Private key. Goes in the `X-SFPY-MERCHANT-SECRET` header. Never leaves the server. */
  SAFEPAY_SECRET_KEY: blankAsUndefined(z.string().optional()),
  /**
   * The endpoint's shared secret, from Dashboard → Developers → Endpoints.
   * **Per environment** — sandbox and live are separate accounts with separate
   * secrets, and rotating one invalidates the old immediately.
   */
  SAFEPAY_WEBHOOK_SECRET: blankAsUndefined(z.string().optional()),
  SAFEPAY_BASE_URL: z.string().url().default('https://sandbox.api.getsafepay.com'),
  SAFEPAY_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  /**
   * The payment channel the shopper is taken through. Which of these works is a
   * property of the Safepay account, not of this code — both are valid and
   * their examples use CYBERSOURCE.
   */
  SAFEPAY_INTENT: z.enum(['CYBERSOURCE', 'MPGS']).default('CYBERSOURCE'),

  /**
   * Where this API is reachable *from the internet* — the return URLs handed to
   * the hosted checkout page, which a customer's browser loads on a mobile
   * network with no idea what `localhost` means.
   *
   * Locally this is a tunnel; in production it is the Railway URL. Defaults to
   * the local address so nothing breaks for COD-only development, where no
   * third party ever calls back.
   */
  PUBLIC_API_URL: z.string().url().default('http://localhost:4000'),

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

  /**
   * Comma-separated Google OAuth client IDs this API will accept tokens for —
   * the Android, iOS and Web client ids from the Cloud Console. These are
   * **audiences, not secrets**: pinning them is what stops a validly-signed
   * token minted for somebody else's app being accepted here.
   *
   * Unset, `/auth/google` answers 503 and email sign-in carries on working.
   */
  GOOGLE_OAUTH_AUDIENCES: blankAsUndefined(z.string().optional()),
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
