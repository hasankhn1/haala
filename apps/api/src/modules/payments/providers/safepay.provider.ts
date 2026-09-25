import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaymentMethod, PaymentStatus } from '@haala/shared';
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
 * Safepay (https://getsafepay.com) — cards for Pakistan, and as of this change
 * the only online gateway Haala runs.
 *
 * ## Which API this is
 *
 * **Express Checkout on v3**, not the v1 API this file used to hold. They share
 * a vendor and nothing else: v1 was one `/order/v1/init` call returning a
 * `?beacon=` URL and took decimal rupees; v3 is a three-call setup returning an
 * `/embedded/` URL and takes minor units. Anything remembered about the old
 * integration is wrong here.
 *
 * The flow is **hosted redirect**: our server creates the session, the customer
 * app opens the returned URL with `openAuthSessionAsync`
 * (`src/lib/onlineCheckout.ts`), and the customer comes back through
 * `GET /payments/return/safepay`. Nothing about the payment touches the phone.
 *
 * ## Money
 *
 * v3 takes the **lowest denomination** — "to charge $100 … the amount will be
 * `10000`". Ours is integer paisa, so the conversion is the identity. That is a
 * reason to keep a named function, not to delete one: it states the assumption
 * in a single place and gives the test something to hold, so the day it stops
 * being true is a red test rather than a 100× charge.
 *
 * ## Trust boundary
 *
 * **The webhook is the only proof of payment.** A customer returning from the
 * hosted page proves a browser closed a tab — they can close it having paid or
 * having not. Signatures are verified over the raw bytes, with a constant-time
 * compare, before any payload is believed.
 */

// ── Money ───────────────────────────────────────────────────────────────────

/**
 * Paisa → Safepay's amount. The identity, deliberately named.
 *
 * Both Safepay v1 and Rapid Gateway took decimal rupees, so a reader who
 * remembers either will assume a `/ 100` belongs here. It does not, and the
 * only thing that can prove that is a test over this function.
 */
export const paisaToSafepayAmount = (paisa: number): number => {
  if (!Number.isInteger(paisa) || paisa < 0) {
    throw AppError.internal(`Invalid paisa amount: ${paisa}`);
  }
  return paisa;
};

/** Inverse, for checking what a webhook claims against what we charged. */
export const safepayAmountToPaisa = (amount: number | string): number => {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isInteger(n) || n < 0) {
    throw AppError.internal(`Invalid Safepay amount: ${amount}`);
  }
  return n;
};

// ── Hosts ───────────────────────────────────────────────────────────────────

/**
 * The checkout host is **not** the API host, and the two environments do not
 * follow the same pattern:
 *
 *   sandbox     api https://sandbox.api.getsafepay.com   checkout the same host
 *   production  api https://api.getsafepay.com           checkout https://getsafepay.com
 *
 * So production checkout drops the `api.` that every other URL in this file
 * carries. Read out of `@sfpy/node-core`'s own `createCheckoutUrl`, because
 * deriving it from the API base would work perfectly in sandbox and 404 on the
 * first live payment.
 */
const CHECKOUT_HOSTS: Record<'sandbox' | 'production', string> = {
  sandbox: 'https://sandbox.api.getsafepay.com',
  production: 'https://getsafepay.com',
};

/** Exported for the test that pins the production host. */
export const buildCheckoutUrl = (params: {
  environment: 'sandbox' | 'production';
  tracker: string;
  tbt: string;
  source: 'hosted' | 'mobile';
  orderId?: string;
  userId?: string;
  redirectUrl?: string;
  cancelUrl?: string;
}): string => {
  const query: Record<string, string | undefined> = {
    environment: params.environment,
    tracker: params.tracker,
    tbt: params.tbt,
    source: params.source,
    order_id: params.orderId,
    user_id: params.userId,
    redirect_url: params.redirectUrl,
    cancel_url: params.cancelUrl,
  };

  const search = Object.entries(query)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&');

  return `${CHECKOUT_HOSTS[params.environment]}/embedded/?${search}`;
};

// ── Status ──────────────────────────────────────────────────────────────────

/**
 * Tracker states → ours. A tracker is a state machine; `TRACKER_ENDED` is the
 * only one that means the money arrived.
 *
 * Anything unrecognised maps to `pending` rather than a guess. A pending
 * payment is recoverable by polling or by the next webhook; one wrongly marked
 * paid ships groceries for free.
 */
const STATE_MAP: Record<string, PaymentStatus> = {
  TRACKER_ENDED: PaymentStatus.Paid,
  TRACKER_AUTHORIZED: PaymentStatus.Authorized,
  TRACKER_STARTED: PaymentStatus.Pending,
  TRACKER_ENROLLED: PaymentStatus.Pending,
  TRACKER_CANCELLED: PaymentStatus.Failed,
  TRACKER_EXPIRED: PaymentStatus.Failed,
  TRACKER_REVERSED: PaymentStatus.Failed,
  TRACKER_VOIDED: PaymentStatus.Failed,
  TRACKER_REFUNDED: PaymentStatus.Refunded,
  TRACKER_PARTIAL_REFUND: PaymentStatus.PartiallyRefunded,
  /*
   * A dispute is recorded *against a payment that completed*, and we have no
   * `disputed` status to move to. Paid is the truthful one — the money did
   * arrive — and the chargeback is handled in their dashboard. Leaving it
   * unmapped would fall through to `pending`, which reads as "we are still
   * waiting" about an order that was delivered.
   */
  TRACKER_DISPUTED: PaymentStatus.Paid,
};

/**
 * The event name beats the state where they disagree, and they **do** disagree:
 * their own `payment.failed` sample carries `"state": "TRACKER_ENROLLED"`,
 * which is a mid-flight state. Reading the state there would leave a failed
 * payment sitting at `pending` forever.
 *
 * `payment.refunded` and `void.succeeded` are deliberately absent — both can
 * mean more than one thing (a full or partial refund; a voided payment or a
 * voided refund) and the state distinguishes them exactly.
 */
const EVENT_MAP: Record<string, PaymentStatus> = {
  'payment.succeeded': PaymentStatus.Paid,
  'payment.failed': PaymentStatus.Failed,
  'authorization.succeeded': PaymentStatus.Authorized,
  'authorization.reversed': PaymentStatus.Failed,
};

export const mapSafepayStatus = (eventType?: string, state?: string): PaymentStatus => {
  if (eventType && EVENT_MAP[eventType]) return EVENT_MAP[eventType] as PaymentStatus;
  if (!state) return PaymentStatus.Pending;
  return STATE_MAP[state] ?? PaymentStatus.Pending;
};

// ── Credentials ─────────────────────────────────────────────────────────────

interface SafepayCredentials {
  /** Public key (`sec_…`), sent as `merchant_api_key` in bodies. */
  apiKey: string;
  /** Private key, sent as the `X-SFPY-MERCHANT-SECRET` header. */
  secretKey: string;
  baseUrl: string;
  environment: 'sandbox' | 'production';
  intent: 'CYBERSOURCE' | 'MPGS';
}

const requireCredentials = (): SafepayCredentials => {
  const { safepay } = config.payments;
  if (!safepay.apiKey || !safepay.secretKey) {
    // Fails loudly at use rather than quietly taking payments nowhere.
    throw AppError.internal(
      'Safepay is the configured online provider but SAFEPAY_API_KEY / ' +
        'SAFEPAY_SECRET_KEY are unset',
    );
  }
  return {
    apiKey: safepay.apiKey,
    secretKey: safepay.secretKey,
    baseUrl: safepay.baseUrl,
    environment: safepay.environment,
    intent: safepay.intent,
  };
};

// ── HTTP ────────────────────────────────────────────────────────────────────

interface SafepayResponse {
  data?: Record<string, unknown> | string;
  status?: { errors?: unknown[]; message?: string };
}

const request = async (
  path: string,
  init: { method: string; body?: unknown },
): Promise<SafepayResponse> => {
  const { secretKey, baseUrl } = requireCredentials();

  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      // `authType: 'secret'` in their own library maps to exactly this header.
      'X-SFPY-MERCHANT-SECRET': secretKey,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const json = (await res.json().catch(() => null)) as SafepayResponse | null;
  if (!res.ok || !json) {
    // Never the response body at error level — an auth failure is exactly where
    // a key would be echoed back.
    logger.warn({ path, status: res.status }, 'Safepay request failed');
    throw AppError.paymentFailed('The payment gateway rejected the request');
  }
  return json;
};

/** Narrow `data.tracker` out of a session or reporter response. */
const readTracker = (json: SafepayResponse): { token?: string; state?: string; environment?: string } => {
  if (!json.data || typeof json.data === 'string') return {};
  const tracker = (json.data as { tracker?: unknown }).tracker;
  if (!tracker || typeof tracker !== 'object') return {};
  return tracker as { token?: string; state?: string; environment?: string };
};

/**
 * Their customer object wants a first and last name; we store one field.
 *
 * Everything before the first space is the first name and the rest is the last,
 * which is wrong for plenty of Pakistani names and is only ever shown back to
 * the person who typed it on a prefilled checkout form. A single-word name
 * gives an empty last name rather than repeating the first.
 */
export const splitName = (name: string): { first: string; last: string } => {
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const cut = trimmed.indexOf(' ');
  if (cut === -1) return { first: trimmed, last: '' };
  return { first: trimmed.slice(0, cut), last: trimmed.slice(cut + 1) };
};

/**
 * Find-or-create is not available: Safepay puts **no uniqueness constraint on
 * email**, so "create one and let them dedupe" silently makes a second customer
 * and strands the cards saved against the first. The token we hold is the only
 * key, which is why this only ever creates when we have nothing.
 *
 * Returns null rather than throwing when there is no email. Their customer
 * object wants one, and an anonymous checkout that cannot save a card is a much
 * better outcome than a customer who cannot check out at all — Rapid Gateway
 * rejected the whole payment for this and it was the wrong call.
 */
const createCustomer = async (
  customer: { name: string; phone: string | null; email?: string | null },
  apiKey: string,
): Promise<string | null> => {
  if (!customer.email) return null;

  const { first, last } = splitName(customer.name);
  const json = await request('/user/customers/v1/', {
    method: 'POST',
    body: {
      merchant_api_key: apiKey,
      first_name: first,
      last_name: last,
      email: customer.email,
      ...(customer.phone ? { phone_number: customer.phone } : {}),
      country: 'PK',
      /*
       * Not a guest. Their tokenization docs are explicit that a card saved
       * against a guest shopper "may only be used once", which would make the
       * whole saved-card feature a lie.
       */
      is_guest: false,
    },
  });

  const token =
    json.data && typeof json.data !== 'string'
      ? (json.data as { token?: string }).token
      : undefined;
  return token ?? null;
};

/**
 * A tracker that comes back stamped with a different environment than we are
 * configured for means the API key and `SAFEPAY_ENVIRONMENT` disagree.
 *
 * Worth failing the checkout over: the alternative is a customer paying real
 * money against a sandbox tracker, or — the direction that actually costs — a
 * free sandbox payment satisfying a live order.
 */
const assertEnvironment = (actual: string | undefined, expected: string, where: string): void => {
  if (actual && actual !== expected) {
    logger.error({ actual, expected, where }, 'Safepay environment mismatch');
    throw AppError.internal(
      `Safepay returned a ${actual} ${where} while configured for ${expected}`,
    );
  }
};

// ── Saved cards ─────────────────────────────────────────────────────────────

/** One stored card, flattened out of their wallet entry. */
export interface SavedCard {
  token: string;
  brand: string | null;
  last4: string | null;
  expiryMonth: string | null;
  expiryYear: string | null;
}

/**
 * Their wallet entry nests the card under the processor that holds it
 * (`cybersource`), and the shape differs per processor. Read defensively: a
 * wallet we cannot fully parse should show fewer cards, never throw on the
 * account screen.
 */
const readCard = (entry: unknown): SavedCard | null => {
  if (!entry || typeof entry !== 'object') return null;
  const e = entry as {
    token?: string;
    is_deleted?: boolean;
    cybersource?: { scheme?: number; bin?: string; last_four?: string; expiry_month?: string; expiry_year?: string };
  };
  if (!e.token || e.is_deleted) return null;

  const card = e.cybersource;
  return {
    token: e.token,
    // Their `scheme` is a numeric code and they publish no table for it, so the
    // BIN is the honest source: 4 is Visa, 5 is Mastercard. Anything else is
    // left null rather than guessed at and shown to a customer.
    brand: card?.bin?.startsWith('4') ? 'Visa' : card?.bin?.startsWith('5') ? 'Mastercard' : null,
    last4: card?.last_four ?? null,
    expiryMonth: card?.expiry_month ?? null,
    expiryYear: card?.expiry_year ?? null,
  };
};

/**
 * The cards Safepay holds for one customer.
 *
 * Deliberately not on `PaymentProvider`: no other gateway here has the concept,
 * and widening the seam for one implementation is how a seam stops meaning
 * anything. The wallet service reaches for these directly.
 */
export const safepayWallet = {
  async list(customerToken: string): Promise<SavedCard[]> {
    const json = await request(
      `/customers/v1/${encodeURIComponent(customerToken)}/wallet/?limit=20&page=1`,
      { method: 'GET' },
    );

    const wallet =
      json.data && typeof json.data !== 'string'
        ? (json.data as { wallet?: unknown[] }).wallet
        : undefined;
    if (!Array.isArray(wallet)) return [];

    return wallet.map(readCard).filter((c): c is SavedCard => c !== null);
  },

  async remove(customerToken: string, paymentMethodToken: string): Promise<void> {
    await request(
      `/user/customers/v1/${encodeURIComponent(customerToken)}/wallet/` +
        encodeURIComponent(paymentMethodToken),
      { method: 'DELETE' },
    );
  },
};

// ── Provider ────────────────────────────────────────────────────────────────

export const safepayProvider: PaymentProvider = {
  key: 'safepay',
  method: PaymentMethod.Online,

  /**
   * Three calls, in order: the payment session, a passport token, then the URL
   * built from both.
   */
  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const creds = requireCredentials();

    /*
     * Reuse the customer we already made, or make one now. Only the first
     * online order per person pays for this extra round trip, and only that
     * call returns a `customerRef` for the caller to persist.
     *
     * A failure here must not take the payment down with it — somebody who
     * cannot be given a Safepay customer can still pay, they just cannot save
     * the card. Anything else trades a working checkout for a convenience.
     */
    let createdCustomerRef: string | null = null;
    let customerRef = input.customer.providerCustomerRef ?? null;
    if (!customerRef) {
      try {
        createdCustomerRef = await createCustomer(input.customer, creds.apiKey);
        customerRef = createdCustomerRef;
      } catch (err) {
        logger.warn({ err, orderId: input.orderId }, 'Safepay customer creation failed');
      }
    }

    const session = await request('/order/payments/v3/', {
      method: 'POST',
      body: {
        merchant_api_key: creds.apiKey,
        intent: creds.intent,
        mode: 'payment',
        currency: input.currency,
        // Paisa, unchanged — see `paisaToSafepayAmount`.
        amount: paisaToSafepayAmount(input.amount),
        // Attaches the payment to the shopper, which is what makes a card
        // saved on their hosted page reachable again next time.
        ...(customerRef ? { user: customerRef } : {}),
        /*
         * The only thing that ties their webhook back to an order of ours.
         * Their payload echoes `data.metadata` verbatim, and `order_id` is
         * written last so a caller-supplied metadata key cannot shadow it.
         */
        metadata: { ...(input.metadata ?? {}), order_id: input.orderId },
      },
    });

    const tracker = readTracker(session);
    assertEnvironment(tracker.environment, creds.environment, 'tracker');

    if (!tracker.token) {
      logger.warn({ orderId: input.orderId }, 'Safepay session returned no tracker token');
      throw AppError.paymentFailed('Could not start the payment');
    }

    /*
     * The passport is minted per checkout and **not cached**, unlike Rapid's
     * OAuth token. It lives an hour and the hosted page dies with it, so a
     * cached one handed out at minute 59 would give that customer a checkout
     * page with sixty seconds left on it. One cheap request per order is the
     * right trade.
     */
    const passport = await request('/client/passport/v1/token', { method: 'POST' });
    const tbt = typeof passport.data === 'string' ? passport.data : undefined;
    if (!tbt) {
      logger.warn({ orderId: input.orderId }, 'Safepay passport returned no token');
      throw AppError.paymentFailed('Could not start the payment');
    }

    // Both legs land on the existing bounce page, which redirects into the app.
    // Reaching it is not evidence of payment and the page says as much.
    const returnUrl = `${config.publicApiUrl}${config.apiPrefix}/payments/return/safepay`;

    const url = buildCheckoutUrl({
      environment: creds.environment,
      tracker: tracker.token,
      tbt,
      /*
       * `mobile`, because the customer app renders this in an embedded WebView
       * (`src/components/PaymentSheet.tsx`) rather than handing it to a browser.
       *
       * It changes how the page finishes: instead of redirecting out to
       * `redirect_url` — which a WebView cannot reliably follow to a custom
       * scheme — it navigates to its own `/external/complete` or
       * `/external/error` and expects the host app to notice. The return URLs
       * below are still sent, because the page honours them in some flows and
       * the app watches for both.
       */
      source: 'mobile',
      orderId: input.orderId,
      ...(customerRef ? { userId: customerRef } : {}),
      redirectUrl: returnUrl,
      cancelUrl: returnUrl,
    });

    logger.info(
      {
        orderId: input.orderId,
        tracker: tracker.token,
        env: creds.environment,
        customer: customerRef ? 'attached' : 'anonymous',
      },
      'Safepay checkout created',
    );

    return {
      providerRef: tracker.token,
      status: PaymentStatus.Pending,
      checkout: { url, token: tracker.token },
      // Only when newly created — reusing one is not news for the caller.
      ...(createdCustomerRef ? { customerRef: createdCustomerRef } : {}),
    };
  },

  async verifyPayment(input: VerifyPaymentInput): Promise<{ status: PaymentStatus }> {
    return this.getPaymentStatus(input.providerRef);
  },

  async getPaymentStatus(providerRef: string | null): Promise<{ status: PaymentStatus }> {
    if (!providerRef) return { status: PaymentStatus.Pending };

    const creds = requireCredentials();
    const json = await request(`/reporter/api/v1/payments/${encodeURIComponent(providerRef)}`, {
      method: 'GET',
    });

    const tracker = readTracker(json);
    assertEnvironment(tracker.environment, creds.environment, 'tracker');

    return { status: mapSafepayStatus(undefined, tracker.state) };
  },

  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const creds = config.payments.safepay;
    const secret = creds.webhookSecret;
    if (!secret) {
      logger.warn('Safepay webhook received but SAFEPAY_WEBHOOK_SECRET is unset');
      // Fixable config — keep their retries alive while somebody sets it.
      return { handled: false, retryable: true };
    }

    const headerValue = input.headers['x-sfpy-signature'] ?? input.headers['X-SFPY-Signature'];
    const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!provided) {
      logger.warn('Safepay webhook missing the X-SFPY-SIGNATURE header');
      return { handled: false, retryable: true };
    }

    /*
     * Over the **raw bytes**, never a re-serialised object: `JSON.stringify` of
     * a parsed body reorders nothing but re-spaces everything, and the hash is
     * over bytes. `payment.routes.ts` uses `express.raw()` for this path so the
     * body arrives untouched.
     *
     * SHA-**512**, which is the one thing about this that looks like a typo and
     * is not — v1 signed with SHA-256.
     */
    const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');
    const expected = createHmac('sha512', secret).update(raw, 'utf8').digest('hex');

    // Length first: `timingSafeEqual` throws on unequal lengths rather than
    // returning false, which would turn a bad signature into a 500.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided.trim().toLowerCase(), 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      /*
       * `retryable` is the whole point of answering non-2xx here. A 2xx tells
       * them the delivery landed and to stop, so acknowledging a payload we
       * could not verify would discard the only notification we were going to
       * get — on the first attempt, silently, if the secret were wrong.
       */
      logger.warn('Safepay webhook signature mismatch');
      return { handled: false, retryable: true };
    }

    let payload: {
      type?: string;
      merchant_api_key?: string;
      data?: {
        tracker?: string;
        state?: string;
        amount?: number | string;
        metadata?: Record<string, unknown>;
      };
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      logger.warn('Safepay webhook body was not valid JSON');
      return { handled: false };
    }

    /*
     * Which account and environment this event belongs to.
     *
     * Their payload carries no `environment` field — but sandbox and live are
     * separate accounts with separate keys, so comparing `merchant_api_key`
     * pins both at once, and also rejects another merchant's event arriving at
     * our endpoint. Without it, registering this URL under sandbox while
     * running live would let a free test payment settle a real order.
     *
     * Not `retryable`: the key will be the same on every retry, so their ladder
     * cannot fix it and the delivery is acknowledged instead.
     */
    if (payload.merchant_api_key && payload.merchant_api_key !== creds.apiKey) {
      logger.error(
        { received: payload.merchant_api_key },
        'Safepay webhook is for a different merchant account — refusing',
      );
      return { handled: false };
    }

    const data = payload.data ?? {};
    const orderId = typeof data.metadata?.order_id === 'string' ? data.metadata.order_id : undefined;

    if (!orderId) {
      logger.warn({ type: payload.type, tracker: data.tracker }, 'Safepay webhook has no order id');
      return { handled: false };
    }

    logger.info({ type: payload.type, tracker: data.tracker, orderId }, 'Safepay webhook verified');

    return {
      handled: true,
      orderId,
      ...(data.tracker ? { providerRef: data.tracker } : {}),
      status: mapSafepayStatus(payload.type, data.state),
      ...(data.amount !== undefined ? { amount: safepayAmountToPaisa(data.amount) } : {}),
    };
  },

  /**
   * A real refund, unlike Rapid Gateway's — their refund endpoint is documented
   * and partial refunds are supported with no limit on how many.
   *
   * The exact action body is the one part of this file not yet exercised
   * against the sandbox; a wrong shape fails loudly through `request`, which is
   * the behaviour we want while that is still true.
   */
  async refundPayment(input: RefundInput): Promise<RefundResult> {
    if (!input.providerRef) return { providerRef: null, status: 'failed' };

    try {
      const json = await request(`/order/payments/v3/${encodeURIComponent(input.providerRef)}`, {
        method: 'POST',
        body: {
          payload: {
            currency: 'PKR',
            amount: paisaToSafepayAmount(input.amount),
            ...(input.reason ? { reason: input.reason } : {}),
          },
        },
      });

      const state = readTracker(json).state;
      logger.info({ providerRef: input.providerRef, state }, 'Safepay refund accepted');
      return { providerRef: input.providerRef, status: 'succeeded' };
    } catch (err) {
      // A failed refund needs a human, so surface it rather than swallowing it.
      logger.error({ err, providerRef: input.providerRef }, 'Safepay refund failed');
      return { providerRef: input.providerRef, status: 'failed' };
    }
  },
};
