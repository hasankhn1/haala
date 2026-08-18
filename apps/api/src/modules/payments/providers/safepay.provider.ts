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
 * Safepay (https://getsafepay.com) — cards and wallets for Pakistan behind one
 * integration.
 *
 * ## The unit trap
 *
 * Everything internal to haala is **integer paisa**. Safepay's API takes
 * **rupees as a decimal**. Getting that backwards would charge a customer 100×
 * or 1/100× the correct amount, which is why the conversion is a named function
 * with its own unit tests rather than an inline `/ 100`.
 *
 * ## Trust boundary
 *
 * The webhook is authoritative for payment state, not the customer returning
 * from the hosted checkout. A browser coming back to the app proves only that
 * someone closed a tab. Signatures are verified over the **raw** body with a
 * constant-time compare before any payload is believed.
 */

/** Safepay amounts are rupees. Ours are paisa. This is the only place that converts. */
export const paisaToSafepayAmount = (paisa: number): number => {
  if (!Number.isInteger(paisa) || paisa < 0) {
    throw AppError.internal(`Invalid paisa amount: ${paisa}`);
  }
  // Two decimals exactly: 12345 paisa → 123.45 rupees.
  return Number(toRupees(paisa).toFixed(2));
};

/** Inverse, for reading amounts back off a Safepay payload. */
export const safepayAmountToPaisa = (rupees: number): number => Math.round(rupees * 100);

/**
 * Safepay's tracker/payment states → our `PaymentStatus`.
 *
 * Anything unrecognised maps to `pending` rather than a guess: leaving a payment
 * pending is recoverable by polling, whereas wrongly marking it paid ships
 * groceries for free.
 */
const STATUS_MAP: Record<string, PaymentStatus> = {
  TRACKER_ENDED: PaymentStatus.Paid,
  PAID: PaymentStatus.Paid,
  paid: PaymentStatus.Paid,
  COMPLETED: PaymentStatus.Paid,
  TRACKER_AUTHORIZED: PaymentStatus.Authorized,
  authorized: PaymentStatus.Authorized,
  TRACKER_REJECTED: PaymentStatus.Failed,
  FAILED: PaymentStatus.Failed,
  failed: PaymentStatus.Failed,
  cancelled: PaymentStatus.Failed,
  REFUNDED: PaymentStatus.Refunded,
  refunded: PaymentStatus.Refunded,
  PARTIALLY_REFUNDED: PaymentStatus.PartiallyRefunded,
};

const mapStatus = (raw: string | undefined): PaymentStatus => {
  if (!raw) return PaymentStatus.Pending;
  return STATUS_MAP[raw] ?? PaymentStatus.Pending;
};

/** Exported for unit tests — the fallback behaviour matters more than the map. */
export const __mapStatusForTests = mapStatus;

const requireCredentials = (): { apiKey: string; secret: string; baseUrl: string } => {
  const { safepay } = config.payments;
  if (!safepay.apiKey || !safepay.secretKey) {
    // Fails loudly at use rather than silently taking payments nowhere.
    throw AppError.internal(
      'Safepay is the configured online provider but SAFEPAY_API_KEY / SAFEPAY_SECRET_KEY are unset',
    );
  }
  return { apiKey: safepay.apiKey, secret: safepay.secretKey, baseUrl: safepay.baseUrl };
};

interface SafepayResponse {
  status?: { errors?: unknown; message?: string };
  data?: Record<string, unknown>;
}

const request = async (
  path: string,
  init: { method: string; body?: unknown },
): Promise<SafepayResponse> => {
  const { apiKey, baseUrl } = requireCredentials();
  const res = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-SFPY-MERCHANT-SECRET': apiKey,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const json = (await res.json().catch(() => null)) as SafepayResponse | null;
  if (!res.ok || !json) {
    logger.warn({ path, status: res.status, body: json }, 'Safepay request failed');
    throw AppError.paymentFailed('The payment gateway rejected the request');
  }
  return json;
};

export const safepayProvider: PaymentProvider = {
  key: 'safepay',
  method: PaymentMethod.Online,

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const { baseUrl } = requireCredentials();

    const json = await request('/order/v1/init', {
      method: 'POST',
      body: {
        client: config.payments.safepay.apiKey,
        // Rupees, not paisa — see the note at the top of this file.
        amount: paisaToSafepayAmount(input.amount),
        currency: input.currency,
        environment: config.payments.safepay.environment,
        // Safepay dedupes on this, so a retried checkout doesn't double-charge.
        order_id: input.idempotencyKey,
        customer: {
          name: input.customer.name,
          phone: input.customer.phone,
          ...(input.customer.email ? { email: input.customer.email } : {}),
        },
        metadata: { orderId: input.orderId, ...(input.metadata ?? {}) },
      },
    });

    const token = (json.data?.token ?? json.data?.tracker) as string | undefined;
    if (!token) {
      logger.warn({ orderId: input.orderId, data: json.data }, 'Safepay init returned no tracker');
      throw AppError.paymentFailed('Could not start the payment');
    }

    // Hosted checkout. `order_id` lets us reconcile the return leg; the webhook
    // remains the source of truth for whether money actually moved.
    const checkoutUrl =
      `${baseUrl.replace('/api', '')}/components?beacon=${encodeURIComponent(token)}` +
      `&env=${encodeURIComponent(config.payments.safepay.environment)}` +
      `&order_id=${encodeURIComponent(input.idempotencyKey)}`;

    logger.info({ orderId: input.orderId, tracker: token }, 'Safepay checkout created');
    return {
      providerRef: token,
      status: PaymentStatus.Pending,
      checkout: { url: checkoutUrl, token },
    };
  },

  async verifyPayment(input: VerifyPaymentInput): Promise<{ status: PaymentStatus }> {
    return this.getPaymentStatus(input.providerRef);
  },

  async getPaymentStatus(providerRef: string | null): Promise<{ status: PaymentStatus }> {
    if (!providerRef) return { status: PaymentStatus.Pending };
    const json = await request(`/order/v1/${encodeURIComponent(providerRef)}`, { method: 'GET' });
    const state = (json.data?.state ?? json.data?.status) as string | undefined;
    return { status: mapStatus(state) };
  },

  /**
   * Verify the HMAC over the raw body, then map the event.
   *
   * `handled: false` on any failure — an unverified payload must never move a
   * payment, and returning false lets the caller log and 200 the gateway
   * without acting on it.
   */
  async handleWebhook(input: WebhookInput): Promise<WebhookResult> {
    const secret = config.payments.safepay.webhookSecret;
    if (!secret) {
      logger.error('Safepay webhook received but SAFEPAY_WEBHOOK_SECRET is unset — ignoring');
      return { handled: false };
    }

    const raw = typeof input.rawBody === 'string' ? input.rawBody : input.rawBody.toString('utf8');

    const headerValue = input.headers['x-sfpy-signature'] ?? input.headers['X-SFPY-Signature'];
    const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!provided) {
      logger.warn('Safepay webhook missing signature header');
      return { handled: false };
    }

    const expected = createHmac('sha256', secret).update(raw, 'utf8').digest('hex');

    // Constant-time compare, and length-check first because timingSafeEqual
    // throws on a length mismatch rather than returning false.
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(provided.trim(), 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      logger.warn('Safepay webhook signature mismatch — rejecting');
      return { handled: false };
    }

    try {
      const body = JSON.parse(raw) as {
        type?: string;
        data?: {
          tracker?: { token?: string; state?: string };
          token?: string;
          state?: string;
          metadata?: { orderId?: string };
          order_id?: string;
        };
      };

      const d = body.data ?? {};
      const providerRef = d.tracker?.token ?? d.token;
      const state = d.tracker?.state ?? d.state ?? body.type;
      const orderId = d.metadata?.orderId;

      logger.info({ providerRef, state, orderId }, 'Safepay webhook verified');
      return {
        handled: true,
        ...(orderId ? { orderId } : {}),
        ...(providerRef ? { providerRef } : {}),
        status: mapStatus(state),
      };
    } catch {
      logger.warn('Safepay webhook body was not valid JSON');
      return { handled: false };
    }
  },

  async refundPayment(input: RefundInput): Promise<RefundResult> {
    if (!input.providerRef) return { providerRef: null, status: 'failed' };
    try {
      await request('/order/v1/refund', {
        method: 'POST',
        body: {
          tracker: input.providerRef,
          amount: paisaToSafepayAmount(input.amount),
          ...(input.reason ? { reason: input.reason } : {}),
        },
      });
      return { providerRef: input.providerRef, status: 'succeeded' };
    } catch (err) {
      // A failed refund needs a human, so surface it rather than swallowing.
      logger.error({ err, providerRef: input.providerRef }, 'Safepay refund failed');
      return { providerRef: input.providerRef, status: 'failed' };
    }
  },
};
