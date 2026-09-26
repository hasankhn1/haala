import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { PaymentMethod, PaymentStatus } from '@haala/shared';
import { paymentRepository } from './payment.repository';
import { paymentService, wouldUnpay } from './payment.service';
import { paymentRegistry } from './providers/registry';

/**
 * A paid payment never becomes unpaid.
 *
 * This used to live inline in `handleWebhook` and nowhere else, which left
 * `verify()` able to undo it — and `verify()` is the riskier caller, because
 * the customer app calls it the instant the checkout sheet closes, racing the
 * webhook that settles the payment.
 *
 * Both directions matter and they pull against each other: too strict and a
 * refund issued from the gateway's dashboard never lands, too loose and an
 * order that has already been picked goes back to pending.
 */
describe('statuses that must not be allowed to undo a payment', () => {
  it('refuses to move a paid payment back to pending', () => {
    // The verify-races-the-webhook case. Safepay maps anything that is not
    // TRACKER_ENDED to pending, so this is what an early verify looks like.
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Pending), true);
  });

  it('refuses to move a paid payment to failed', () => {
    // The out-of-order-delivery case: a stale failure landing after a success.
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Failed), true);
  });

  it('refuses to move a paid payment back to authorized', () => {
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Authorized), true);
  });
});

describe('statuses that legitimately follow a payment', () => {
  it('allows a refund', () => {
    /*
     * Not the payment coming undone — the next thing that happens to money we
     * definitely received. Safepay's refunds are issued from their dashboard by
     * ops, so this arrives as a `payment.refunded` webhook on a paid row. Block
     * it and the refund silently never reaches us.
     */
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Refunded), false);
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.PartiallyRefunded), false);
  });

  it('allows the same status to be re-applied', () => {
    // Every gateway redelivers. Re-applying paid must be a no-op, not a refusal.
    assert.equal(wouldUnpay(PaymentStatus.Paid, PaymentStatus.Paid), false);
  });
});

describe('a payment that is not yet paid moves freely', () => {
  it('lets a pending payment go anywhere', () => {
    // The guard is about leaving `paid`, not about ordering in general —
    // nothing else here is irreversible.
    for (const next of [
      PaymentStatus.Paid,
      PaymentStatus.Failed,
      PaymentStatus.Authorized,
      PaymentStatus.Pending,
    ]) {
      assert.equal(wouldUnpay(PaymentStatus.Pending, next), false, `pending → ${next}`);
    }
  });

  it('lets a failed payment still become paid', () => {
    // A customer who retries and succeeds. Refusing this would strand money we
    // have actually taken.
    assert.equal(wouldUnpay(PaymentStatus.Failed, PaymentStatus.Paid), false);
  });

  it('does not lock a refunded payment', () => {
    // Only `paid` is guarded; a refunded row is already terminal by other means.
    assert.equal(wouldUnpay(PaymentStatus.Refunded, PaymentStatus.Pending), false);
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
   * Testing the helper proves the helper. This proves the call site — which is
   * the thing that was missing, and which a green helper test would happily
   * keep passing without.
   */
  it('does not write when the gateway answers pending for a paid payment', async (t) => {
    t.mock.method(paymentRepository, 'findByOrderId', async () => paidPayment);
    t.mock.method(paymentRegistry, 'get', () => ({
      key: 'safepay',
      // What Safepay answers for any tracker that is not TRACKER_ENDED — i.e.
      // a verify that arrived before the webhook settled it.
      verifyPayment: async () => ({ status: PaymentStatus.Pending }),
    }) as never);
    const write = t.mock.method(paymentRepository, 'updateStatus', async () => paidPayment);

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
      'updateStatus',
      async () => ({ ...paidPayment, status: PaymentStatus.Refunded }) as never,
    );

    const result = await paymentService.verify('order-1');

    assert.equal(write.mock.callCount(), 1, 'a refund is forward motion, not un-paying');
    assert.equal(result.status, PaymentStatus.Refunded);
    mock.restoreAll();
  });

  it('still writes when the payment was never paid', async (t) => {
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
      'updateStatus',
      async () => ({ ...paidPayment, status: PaymentStatus.Paid }) as never,
    );

    await paymentService.verify('order-1');
    assert.equal(write.mock.callCount(), 1, 'the ordinary happy path must still work');
    mock.restoreAll();
  });
});
