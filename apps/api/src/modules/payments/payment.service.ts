import { CURRENCY, PaymentMethod, PaymentStatus } from '@haala/shared';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import { db, type Executor } from '../../db/client';
import type { Payment } from '../../db/schema';
import { notificationService } from '../notifications/notification.service';
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
  /**
   * A gateway customer the provider created during this call. The caller owns
   * the user row, so the caller persists it — this module has no business
   * writing to `users`.
   */
  customerRef?: string | null;
}

/**
 * The states that legitimately come **after** `paid`.
 *
 * A refund is not the payment coming undone — it is the next thing that happens
 * to money we definitely received — so it has to be allowed through, or a refund
 * issued from the gateway's own dashboard would never reach us.
 */
const AFTER_PAID: ReadonlySet<PaymentStatus> = new Set([
  PaymentStatus.Paid,
  PaymentStatus.Refunded,
  PaymentStatus.PartiallyRefunded,
]);

/**
 * **A paid payment never becomes unpaid.**
 *
 * Two callers need this and only one had it. Gateways retry and deliveries
 * arrive out of order, so a stale `failed` can land after a `succeeded` — and
 * `verify()` is the worse case, because the customer app calls it the instant
 * the checkout sheet closes (`runOnlineCheckout`), which is exactly when it
 * races the webhook and reads a tracker that has not settled yet.
 *
 * Since `verify()` also announces the outcome now, an unguarded one does not
 * just corrupt the row — it pushes "Payment didn't go through" at a customer
 * whose order is paid and possibly already picked.
 *
 * Exported for its own tests: the direction of this check is the whole point,
 * and it has to be able to fail.
 */
export const wouldUnpay = (current: PaymentStatus, next: PaymentStatus): boolean =>
  current === PaymentStatus.Paid && !AFTER_PAID.has(next);

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

    return {
      payment,
      checkout: result.checkout ?? null,
      ...(result.customerRef ? { customerRef: result.customerRef } : {}),
    };
  },

  async verify(orderId: string): Promise<Payment> {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw AppError.notFound('Payment not found for order');

    const provider = paymentRegistry.get(payment.provider);
    const { status } = await provider.verifyPayment({ orderId, providerRef: payment.providerRef });

    /*
     * The same guard the webhook has, for the same reason — and this is the
     * caller that needs it most. `transitionStatus` only refuses a *no-op*
     * (`status <> $2`), so paid → pending is a write it would happily make.
     */
    if (wouldUnpay(payment.status, status)) {
      logger.warn(
        { paymentId: payment.id, incoming: status },
        'Ignoring a verify that would un-pay a paid payment',
      );
      return payment;
    }

    const moved = await paymentRepository.transitionStatus(payment.id, status);
    if (moved) void notificationService.notifyPaymentOutcome(moved);
    return moved ?? payment;
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

    if (wouldUnpay(payment.status, result.status)) {
      logger.warn(
        { paymentId: payment.id, incoming: result.status },
        'Ignoring a webhook that would un-pay a paid payment',
      );
      return { handled: true };
    }

    const patch = {
      providerRef: result.providerRef ?? payment.providerRef,
      rawPayload: safeJson(webhook.rawBody),
    };
    /*
     * One statement per delivery.
     *
     * This used to fall back to a second `updateStatus` when `transitionStatus`
     * matched nothing, so every redelivery on a gateway's retry ladder cost an
     * extra round trip and a no-op UPDATE on a hot table. The fallback only
     * re-recorded the payload of an event we already hold — the same event,
     * redelivered — so dropping it loses nothing and keeps the first payload,
     * which is the one that actually moved the payment.
     *
     * The condition has to stay inside the UPDATE. `verify` and the webhook
     * race routinely, and comparing a status we read a moment ago would let
     * both of them decide they were the transition and push the customer two
     * notifications.
     */
    const moved = await paymentRepository.transitionStatus(payment.id, result.status, patch);
    if (moved) void notificationService.notifyPaymentOutcome(moved);
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
    // A refund the gateway refused needs a human, not a "Refund issued" push.
    if (result.status !== 'failed') void notificationService.notifyRefund(orderId, amount);
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
