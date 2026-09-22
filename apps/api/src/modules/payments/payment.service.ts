import { CURRENCY, PaymentMethod, PaymentStatus } from '@haala/shared';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { db, type Executor } from '../../db/client';
import type { Payment } from '../../db/schema';
import { paymentRepository } from './payment.repository';
import type {
  CheckoutHandoff,
  PaymentCustomer,
  WebhookInput,
} from './providers/payment-provider.interface';
import { paymentRegistry } from './providers/registry';

export interface InitiatePaymentInput {
  orderId: string;
  method: PaymentMethod;
  amount: number; // paisa
  idempotencyKey: string;
  customer: PaymentCustomer;
}

export interface InitiatePaymentResult {
  payment: Payment;
  checkout: CheckoutHandoff | null;
}

export const paymentService = {
  /**
   * Create (or return the existing) payment for an order. Idempotent on
   * `idempotencyKey` so retries never double-create or double-charge.
   *
   * NOTE: for real online gateways that make network calls, prefer recording a
   * pending payment inside the order transaction and calling the gateway right
   * after commit. COD and the stub provider are local, so a single call is safe.
   */
  async initiate(input: InitiatePaymentInput, ex: Executor = db): Promise<InitiatePaymentResult> {
    const existing = await paymentRepository.findByIdempotencyKey(input.idempotencyKey, ex);
    if (existing) return { payment: existing, checkout: null };

    const provider = paymentRegistry.forMethod(input.method);
    const result = await provider.createPayment({
      orderId: input.orderId,
      amount: input.amount,
      currency: CURRENCY,
      idempotencyKey: input.idempotencyKey,
      customer: input.customer,
    });

    const payment = await paymentRepository.create(
      {
        orderId: input.orderId,
        method: input.method,
        provider: provider.key,
        status: result.status,
        amount: input.amount,
        currency: CURRENCY,
        providerRef: result.providerRef,
        idempotencyKey: input.idempotencyKey,
      },
      ex,
    );

    return { payment, checkout: result.checkout ?? null };
  },

  async verify(orderId: string): Promise<Payment> {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw AppError.notFound('Payment not found for order');

    const provider = paymentRegistry.get(payment.provider);
    const { status } = await provider.verifyPayment({ orderId, providerRef: payment.providerRef });
    const updated = await paymentRepository.updateStatus(payment.id, status);
    return updated ?? payment;
  },

  /** Process a verified provider webhook and reconcile the payment status. */
  async handleWebhook(
    providerKey: string,
    webhook: WebhookInput,
  ): Promise<{ handled: boolean; retryable?: boolean }> {
    const provider = paymentRegistry.get(providerKey);
    const result = await provider.handleWebhook(webhook);
    if (!result.handled || !result.status) {
      return { handled: false, ...(result.retryable ? { retryable: true } : {}) };
    }

    /*
     * A provider identifies the payment by whichever reference its gateway
     * gives back. Safepay knows our order id; Rapid Gateway echoes the
     * `BASKET_ID` we submitted, which is the payment's idempotency key. Both
     * columns are unique-indexed, so either resolves exactly one row.
     */
    const payment = result.orderId
      ? await paymentRepository.findByOrderId(result.orderId)
      : result.idempotencyKey
        ? await paymentRepository.findByIdempotencyKey(result.idempotencyKey)
        : undefined;

    if (!payment) {
      logger.warn(
        { orderId: result.orderId, idempotencyKey: result.idempotencyKey },
        'Webhook for unknown payment',
      );
      return { handled: false };
    }

    /*
     * The amount has to match what we charged.
     *
     * A webhook claiming a different figure is either a bug at the gateway or
     * someone who has worked out our endpoint, and neither should mark an order
     * paid. Providers that cannot report an amount simply omit it.
     */
    if (result.amount !== undefined && result.amount !== payment.amount) {
      logger.error(
        { paymentId: payment.id, expected: payment.amount, claimed: result.amount },
        'Webhook amount does not match the payment — refusing',
      );
      return { handled: false };
    }

    /*
     * Never move backwards out of `paid`.
     *
     * Gateways retry — Rapid Gateway's ladder runs 30s, 2m, 10m, 1h, 6h — and
     * deliveries can arrive out of order, so a stale `failed` can legitimately
     * land after a `completed`. Re-applying the same status is harmless;
     * un-paying a paid order is not, and it would strand an order that has
     * already been picked.
     */
    if (payment.status === PaymentStatus.Paid && result.status !== PaymentStatus.Paid) {
      logger.warn(
        { paymentId: payment.id, incoming: result.status },
        'Ignoring a webhook that would un-pay a paid payment',
      );
      return { handled: true };
    }

    await paymentRepository.updateStatus(payment.id, result.status, {
      providerRef: result.providerRef ?? payment.providerRef,
      rawPayload: safeJson(webhook.rawBody),
    });
    return { handled: true };
  },

  async refund(orderId: string, amount: number, reason?: string): Promise<void> {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw AppError.notFound('Payment not found for order');
    if (payment.status !== PaymentStatus.Paid && payment.status !== PaymentStatus.PartiallyRefunded) {
      throw AppError.invalidState('Only paid payments can be refunded');
    }
    if (amount <= 0 || amount > payment.amount) {
      throw AppError.badRequest('Invalid refund amount');
    }

    const provider = paymentRegistry.get(payment.provider);
    const result = await provider.refundPayment({
      providerRef: payment.providerRef,
      amount,
      reason,
    });

    await paymentRepository.createRefund({
      paymentId: payment.id,
      amount,
      status: result.status,
      providerRef: result.providerRef,
      reason,
    });

    const isFull = amount >= payment.amount;
    await paymentRepository.updateStatus(
      payment.id,
      isFull ? PaymentStatus.Refunded : PaymentStatus.PartiallyRefunded,
    );
  },

  /** Called by the Delivery flow when a rider collects COD. */
  async markCodCollected(orderId: string): Promise<void> {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment || payment.method !== PaymentMethod.Cod) return;
    await paymentRepository.updateStatus(payment.id, PaymentStatus.Paid);
  },

  async getStatus(orderId: string): Promise<{ status: PaymentStatus; method: PaymentMethod }> {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw AppError.notFound('Payment not found for order');
    return { status: payment.status, method: payment.method };
  },
};

const safeJson = (raw: Buffer | string): unknown => {
  try {
    return JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return null;
  }
};
