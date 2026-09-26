import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { PaymentMethod, PaymentStatus } from '@haala/shared';
import { paymentRepository } from './payment.repository';
import { paymentService, wouldUnpay } from './payment.service';
import { paymentRegistry } from './providers/registry';

/**
 * A paid payment never becomes unpaid.
 *
 * This lived inline in `handleWebhook` and nowhere else, which left `verify()`
 * able to undo it — and `verify()` is the riskier caller: the customer app
 * calls it the instant the checkout sheet closes, racing the webhook that
 * settles the payment. Since it now also announces the outcome, an unguarded
 * one pushes "Payment didn't go through" at a customer whose order is paid.
 */
describe('statuses that must not be allowed to undo a payment', () => {
  it('refuses paid → pending, which is what an early verify looks like', () => {
    // Safepay maps anything that is not TRACKER_ENDED to pending.
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Pending), true);
  });

  it('refuses paid → failed, which is a stale delivery arriving late', () => {
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Failed), true);
  });

  it('refuses paid → authorized', () => {
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Authorized), true);
  });
});

describe('statuses that legitimately follow a payment', () => {
  it('allows a refund', () => {
    // Not the payment coming undone — the next thing that happens to money we
    // definitely received. Blocking it would swallow a dashboard refund.
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Refunded), false);
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.PartiallyRefunded), false);
  });

  it('allows the same status to be re-applied', () => {
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Paid), false);
  });

  it('leaves a payment that is not yet paid free to move', () => {
    for (const next of [PaymentStatus.Paid, PaymentStatus.Failed, PaymentStatus.Authorized]) {
      assert.equal(wouldUnpay(PaymentStatus.Pending, next), false, `pending → ${next}`);
    }
    // A customer who retries and succeeds.
    assert.equal(wouldUnpay(PaymentStatus.Failed, PaymentStatus.Paid), false);
  });
});

describe('verify() is actually wired to the guard', () => {
  const paidPayment = {
    id: 'pay-1',
    orderId: 'order-1',
    provider: 'safepay',
    method: PaymentMethod.Online,
    status: PaymentStatus.Paid,
    amount: 12_345,
    providerRef: 'track_1',
  } as never;

  /**
   * Testing the helper proves the helper. This proves the call site — the thing
   * that was missing, and which a green helper test would happily keep passing
   * without.
   */
  it('does not write when the gateway answers pending for a paid payment', async (t) => {
    t.mock.method(paymentRepository, 'findByOrderId', async () => paidPayment);
    t.mock.method(paymentRegistry, 'get', () => ({
      key: 'safepay',
      verifyPayment: async () => ({ status: PaymentStatus.Pending }),
    }) as never);
    const write = t.mock.method(paymentRepository, 'transitionStatus', async () => paidPayment);

    const result = await paymentService.verify('order-1');

    assert.equal(write.mock.callCount(), 0, 'the paid row must not be touched');
    assert.equal(result.status, PaymentStatus.Paid, 'and the caller still sees paid');
    mock.restoreAll();
  });

  it('still writes a refund through', async (t) => {
    t.mock.method(paymentRepository, 'findByOrderId', async () => paidPayment);
    t.mock.method(paymentRegistry, 'get', () => ({
      key: 'safepay',
      verifyPayment: async () => ({ status: PaymentStatus.Refunded }),
    }) as never);
    const write = t.mock.method(
      paymentRepository,
      'transitionStatus',
      async () => ({ ...paidPayment, status: PaymentStatus.Refunded }) as never,
    );

    await paymentService.verify('order-1');
    assert.equal(write.mock.callCount(), 1, 'a refund is forward motion, not un-paying');
    mock.restoreAll();
  });

  it('still writes the ordinary pending → paid', async (t) => {
    t.mock.method(paymentRepository, 'findByOrderId', async () => ({
      ...paidPayment,
      status: PaymentStatus.Pending,
    }) as never);
    t.mock.method(paymentRegistry, 'get', () => ({
      key: 'safepay',
      verifyPayment: async () => ({ status: PaymentStatus.Paid }),
    }) as never);
    const write = t.mock.method(
      paymentRepository,
      'transitionStatus',
      async () => ({ ...paidPayment, status: PaymentStatus.Paid }) as never,
    );

    await paymentService.verify('order-1');
    assert.equal(write.mock.callCount(), 1, 'the happy path must still work');
    mock.restoreAll();
  });
});
