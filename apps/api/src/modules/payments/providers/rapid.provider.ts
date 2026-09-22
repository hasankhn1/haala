import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentMethod, PaymentStatus, toRupees } from '@haala/shared';
import { AppError } from '../../../common/errors';
import { config } from '../../../config';
import { logger } from '../../../common/logger';
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RefundInput,
  RefundResult,
  VerifyPaymentInput,
  WebhookInput,
  WebhookResult,
} from './payment-provider.interface';

/**
 * Rapid Gateway (https://rapidgateway.pk) — cards, wallets, bank transfer and
 * Raast for Pakistan.
 *
 * ## The unit trap
 *
 * Everything internal to Haala is **integer paisa**. Their `TXNAMT` is
 * **decimal rupees** (`1500.00`). Getting that backwards charges a customer 100×
 * or 1/100× the right amount, so the conversion is a named function with its own
 * tests rather than an inline `/ 100` — the same treatment Safepay gets, for the
 * same reason.
 *
 * ## Trust boundary
 *
 * **The webhook is the only proof of payment.** Their documentation says so
 * twice, and their redirect makes it unavoidable: a customer whose wallet
 * approval is still PENDING is returned to `SUCCESS_URL` too, and in LIVE that
 * URL carries no parameters at all. Returning from checkout proves a browser
 * closed a tab and nothing more.
 *
 * ## Which flow this is
 *
 * The **hosted redirect** (`/rapid/process-transaction`), not the embedded
 * checkout session. Their JS SDK is browser-only — their own docs say mobile is
 * "WebView today" — and the redirect hands back exactly the URL the app already
 * knows how to open (`src/lib/onlineCheckout.ts`).
 */

// ── Money ───────────────────────────────────────────────────────────────────

/** Their amounts are decimal rupees. Ours are paisa. This converts, nothing else does. */
export const paisaToRapidAmount = (paisa: number): string => {
  if (!Number.isInteger(paisa) || paisa < 0) {
    throw AppError.internal(`Invalid paisa amount: ${paisa}`);
  }
  // A string, not a number: the field is form-encoded and they document
  // `1500.00`. `String(1500)` would send "1500", and `toFixed` keeps the two
  // decimals they show in every example.
  return toRupees(paisa).toFixed(2);
};

/** Inverse, for checking the amount a webhook claims against what we charged. */
export const rapidAmountToPaisa = (rupees: number | string): number => {
  const n = typeof rupees === 'string' ? Number(rupees) : rupees;
  if (!Number.isFinite(n)) throw AppError.internal(`Invalid rapid amount: ${rupees}`);
  return Math.round(n * 100);
};

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Their vocabulary → ours.
 *
 * Two vocabularies appear in their docs and both are handled: webhook payloads
 * carry `status: "SUCCESS"`, checkout sessions carry `SUCCEEDED | FAILED |
 * PROCESSING | EXPIRED`.
 *
 * Anything unrecognised maps to `pending` rather than a guess. A payment left
 * pending is recoverable — their webhook retries for six hours. Wrongly marking
 * one paid ships groceries for free.
 */
const STATUS_MAP: Record<string, PaymentStatus> = {
  SUCCESS: PaymentStatus.Paid,
  SUCCEEDED: PaymentStatus.Paid,
  COMPLETED: PaymentStatus.Paid,
  FAILED: PaymentStatus.Failed,
  EXPIRED: PaymentStatus.Failed,
  TIMEOUT: PaymentStatus.Failed,
  INSUFFICIENT_BALANCE: PaymentStatus.Failed,
  INVALID_OTP: PaymentStatus.Failed,
  PROCESSING: PaymentStatus.Pending,
  PENDING: PaymentStatus.Pending,
  REFUNDED: PaymentStatus.Refunded,
};

/**
 * The event name is more reliable than the status field for the two terminal
 * payment events, so it wins where they disagree.
 */
const EVENT_MAP: Record<string, PaymentStatus> = {
  'transaction.completed': PaymentStatus.Paid,
  'transaction.failed': PaymentStatus.Failed,
  'refund.succeeded': PaymentStatus.Refunded,
};

export const mapRapidStatus = (eventType?: string, status?: string): PaymentStatus => {
  if (eventType && EVENT_MAP[eventType]) return EVENT_MAP[eventType] as PaymentStatus;
  if (!status) return PaymentStatus.Pending;
  return STATUS_MAP[status.toUpperCase()] ?? PaymentStatus.Pending;
};

// ── Credentials ─────────────────────────────────────────────────────────────

interface RapidCredentials {
  merchantId: string;
  clientId: string;
  clientSecret: string;
  baseUrl: string;
  environment: 'TEST' | 'LIVE';
  merchantName: string;
}

const requireCredentials = (): RapidCredentials => {
  const { rapid } = config.payments;
  if (!rapid.merchantId || !rapid.clientSecret) {
    // Fails loudly at use rather than quietly taking payments nowhere.
    throw AppError.internal(
      'Rapid Gateway is the configured online provider but RAPID_MERCHANT_ID / ' +
        'RAPID_CLIENT_SECRET are unset',
    );
  }
  return {
    merchantId: rapid.merchantId,
    // Their sample code passes the merchant id as the OAuth client id while the
    // prose says `clientId`. Defaulting to the merchant id makes the common case
    // work with one fewer variable, and `RAPID_CLIENT_ID` overrides it if they
    // turn out to be different.
    clientId: rapid.clientId ?? rapid.merchantId,
    clientSecret: rapid.clientSecret,
    baseUrl: rapid.baseUrl,
    environment: rapid.environment,
    merchantName: rapid.merchantName,
  };
};

// ── Token ───────────────────────────────────────────────────────────────────

/**
 * Their access token lives **299 seconds**, so fetching one per request would
 * double the latency of every payment for no reason.
 *
 * Cached in memory rather than in Redis, deliberately: a token is per-process
 * and costs one cheap request to replace, so putting the payment path behind a
 * second network dependency would add a failure mode and buy nothing. Each
 * instance holding its own is correct.
 */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** Refresh this far before expiry, so a token cannot die mid-request. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

/** Test seam — lets a test start from a known state rather than a leftover token. */
export const __resetRapidTokenForTests = (): void => {
  cachedToken = null;
};

const accessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;

  const { clientId, clientSecret, baseUrl } = requireCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(`${baseUrl}/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
  });

  const json = (await res.json().catch(() => null)) as
    | { access_token?: string; expires_in?: number }
    | null;

  if (!res.ok || !json?.access_token) {
    // Never log the body — an auth response is exactly where a secret would be.
    logger.warn({ status: res.status }, 'Rapid Gateway token request failed');
    throw AppError.paymentFailed('Could not reach the payment gateway');
  }

  const ttlMs = (json.expires_in ?? 299) * 1000;
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(ttlMs - TOKEN_SAFETY_MARGIN_MS, 0),
  };
  return json.access_token;
};

// ── Provider ────────────────────────────────────────────────────────────────

export const rapidProvider: PaymentProvider = {
  key: 'rapid',
  method: PaymentMethod.Online,

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const creds = requireCredentials();
    const token = await accessToken();

    /*
     * They require both, and our `PaymentCustomer` allows neither: a customer
     * who signed in with Google has no phone until checkout asks for one.
     * Failing here names the missing field; letting it through produces an
     * opaque 400 from their side halfway through a checkout.
     */
    if (!input.customer.phone) {
      throw AppError.badRequest('A mobile number is needed to pay online');
    }
    if (!input.customer.email) {
      throw AppError.badRequest('An email address is needed to pay online');
    }

    const returnBase = `${config.publicApiUrl}${config.apiPrefix}/payments/return/rapid`;

    const body = new URLSearchParams({
      MERCHANT_ID: creds.merchantId,
      MERCHANT_NAME: creds.merchantName,
      TXNAMT: paisaToRapidAmount(input.amount),
      CURRENCY_CODE: input.currency,
      CUSTOMER_MOBILE_NO: input.customer.phone,
      CUSTOMER_EMAIL_ADDRESS: input.customer.email,
      /*
       * Their idempotency key, and the only field echoed back on the webhook
       * (`merchantTransactionId`). Reusing one is rejected as a duplicate, so
       * it must be unique per *attempt* — ours is unique per order, which is
       * correct until something offers a retry. Derived here and nowhere else,
       * so that change is one line.
       */
      BASKET_ID: input.idempotencyKey,
      SUCCESS_URL: `${returnBase}?outcome=success`,
      FAILURE_URL: `${returnBase}?outcome=failure`,
      CHECKOUT_URL: `${returnBase}?outcome=cancelled`,
      TXNDESC: `Haala order`,
      VERSION: 'MY_VER_1.0',
      PROCCODE: '0',
    });

    const res = await fetch(`${creds.baseUrl}/rapid/process-transaction`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Environment': creds.environment,
      },
      body: body.toString(),
      // The checkout URL is the `Location` header of a 302, not a JSON field.
      // Following it here would fetch the page and throw the address away.
      redirect: 'manual',
    });

    const checkoutUrl = res.headers.get('location');
    if (!checkoutUrl) {
      logger.warn(
        { orderId: input.orderId, status: res.status },
        'Rapid Gateway returned no checkout redirect',
      );
      throw AppError.paymentFailed('Could not start the payment');
    }

    logger.info(
      { orderId: input.orderId, basketId: input.idempotencyKey, env: creds.environment },
      'Rapid Gateway checkout created',
    );

    /*
     * No `providerRef` yet — their gateway reference (`gatewayTxnRef`) arrives
     * with the webhook. Inventing one now would put a value in a column that
     * means "their id for this payment" when we do not have it.
     */
    return {
      providerRef: null,
      status: PaymentStatus.Pending,
      checkout: { url: checkoutUrl },
    };
  },

  async verifyPayment(input: VerifyPaymentInput): Promise<{ status: PaymentStatus }> {
    return this.getPaymentStatus(input.providerRef);
  },

  /**
   * There is no documented status endpoint for the redirect flow — the one they
   * publish (`GET /v1/checkout-sessions/{id}`) belongs to the embedded SDK,
   * which this is not. Until they confirm one, this reports what we already
   * know rather than pretending to check.
   *
   * That is not the gap it looks like: this call is a *confirmation* step, and
   * the webhook is the trigger. Nothing fulfils an order from here.
   */
  async getPaymentStatus(providerRef: string | null): Promise<{ status: PaymentStatus }> {
    logger.info(
      { providerRef },
      'Rapid Gateway has no redirect-flow status endpoint; relying on the webhook',
    );
    return { status: PaymentStatus.Pending };
  },

  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const secret = config.payments.rapid.webhookSecret;
    if (!secret) {
      logger.warn('Rapid Gateway webhook received but RAPID_WEBHOOK_SECRET is unset');
      // Fixable config — let them retry while somebody sets it.
      return { handled: false, retryable: true };
    }

    const header = (name: string): string | undefined => {
      const v = input.headers[name] ?? input.headers[name.toLowerCase()];
      return Array.isArray(v) ? v[0] : v;
    };

    const signature = header('x-rapidgateway-signature');
    const timestamp = header('x-rapidgateway-timestamp');
    if (!signature || !timestamp) {
      logger.warn('Rapid Gateway webhook missing signature headers');
      return { handled: false, retryable: true };
    }

    /*
     * The five-minute window is half the protection: without it a signature
     * captured once could be replayed indefinitely, because the body and the
     * signature stay valid forever.
     */
    const skewSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (!Number.isFinite(skewSeconds) || skewSeconds > 300) {
      logger.warn({ skewSeconds }, 'Rapid Gateway webhook outside the 5-minute window');
      return { handled: false, retryable: true };
    }

    /*
     * Over the **raw bytes**, never a re-serialised object. Their docs call
     * re-serialising the number-one cause of signatures that never match, and
     * `app.ts` already skips the JSON parser for this path so the body arrives
     * untouched.
     */
    const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
    const expected = createHmac('sha256', secret)
      .update(`${timestamp}.${raw}`, 'utf8')
      // Uppercase, which is their documented format and not the usual default.
      .digest('hex')
      .toUpperCase();

    // Length first: `timingSafeEqual` throws on unequal lengths rather than
    // returning false, which would turn a bad signature into a 500.
    const a = Buffer.from(expected);
    const b = Buffer.from(signature.toUpperCase());
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn('Rapid Gateway webhook signature mismatch');
      return { handled: false, retryable: true };
    }

    const payload = JSON.parse(raw) as {
      eventId?: string;
      eventType?: string;
      merchantTransactionId?: string;
      gatewayTxnRef?: string;
      status?: string;
      amount?: number | string;
      environment?: string;
    };

    const eventType = payload.eventType ?? '';

    /*
     * Refund events carry the **refundRef** in `merchantTransactionId`, not the
     * basket id, so matching them the same way would look up a payment that
     * does not exist — or worse, one that happens to collide. Acknowledged and
     * left for the refunds work.
     */
    if (eventType.startsWith('refund.') || eventType.startsWith('reversal.')) {
      logger.info({ eventId: payload.eventId, eventType }, 'Rapid Gateway non-payment event');
      return { handled: false };
    }

    if (!payload.merchantTransactionId) {
      logger.warn({ eventId: payload.eventId, eventType }, 'Rapid Gateway webhook has no basket id');
      return { handled: false };
    }

    return {
      handled: true,
      // Their basket id is our payment's idempotency key — the service resolves
      // the order from it.
      idempotencyKey: payload.merchantTransactionId,
      ...(payload.gatewayTxnRef ? { providerRef: payload.gatewayTxnRef } : {}),
      status: mapRapidStatus(eventType, payload.status),
      ...(payload.amount !== undefined ? { amount: rapidAmountToPaisa(payload.amount) } : {}),
    };
  },

  /**
   * Their refund events are documented; the endpoint that raises one is not.
   *
   * Throwing makes a refund attempt a visible failure that ops can act on,
   * rather than a silent no-op that leaves everyone believing money moved.
   * Cancel-and-refund on COD is unaffected — that never reaches a gateway.
   */
  async refundPayment(_input: RefundInput): Promise<RefundResult> {
    throw AppError.invalidState(
      'Refunds are not wired for Rapid Gateway yet — issue the refund from their ' +
        'portal and record it here. Their Refunds API is undocumented in what we have.',
    );
  },
};
