import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { eq } from 'drizzle-orm';
import { PaymentMethod, PaymentStatus } from '@haala/shared';
import { createApp } from '../../app';
import { config } from '../../config';
import { closeDb, db } from '../../db/client';
import { orders, payments, stores, users } from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * Guards that live in `paymentService.handleWebhook`, so they protect every
 * gateway rather than whichever one happened to be written last.
 *
 * **The amount must match.** A webhook claiming a figure other than the one we
 * charged is either a bug at the gateway or somebody who has found the
 * endpoint. Neither should mark an order paid.
 *
 * **A paid payment never becomes unpaid.** Gateways retry, and deliveries
 * arrive out of order, so a stale `payment.failed` can legitimately land after
 * a `payment.succeeded`. Re-applying a status is harmless; un-paying an order
 * that has already been picked is not.
 *
 * **A webhook for another merchant account is refused.** Safepay's payload
 * carries no environment field, but sandbox and live are separate accounts with
 * separate keys — so `merchant_api_key` pins both at once. Without it, this
 * endpoint registered under sandbox while running live would let a free test
 * payment settle a real order.
 *
 * Driven through the real HTTP endpoint with real signatures, because the raw
 * body and the SHA-512 over it are half of what is being tested.
 */
const SECRET = 'guard-test-secret';
const API_KEY = 'sec_guard-test-account';

let base = '';
let close: () => Promise<void> = async () => {};
let paymentId = '';
let orderId = '';
let restoreSecret: string | undefined;
let restoreApiKey: string | undefined;

const post = async (body: string) => {
  // Safepay signs with HMAC-SHA512 over the raw body. No timestamp component —
  // unlike the scheme this file used to exercise.
  const signature = createHmac('sha512', SECRET).update(body, 'utf8').digest('hex');
  const res = await fetch(`${base}/api/v1/payments/webhooks/safepay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-sfpy-signature': signature },
    body,
  });
  return res.status;
};

const event = (over: Record<string, unknown> = {}, dataOver: Record<string, unknown> = {}) =>
  JSON.stringify({
    token: `evt_${Math.random().toString(36).slice(2)}`,
    version: '2.0.0',
    merchant_api_key: API_KEY,
    type: 'payment.succeeded',
    ...over,
    data: {
      tracker: 'track_guard-test',
      state: 'TRACKER_ENDED',
      // Minor units, so this is 12,345 paisa — the figure on the payment row.
      amount: 12_345,
      currency: 'PKR',
      metadata: { order_id: orderId },
      ...dataOver,
    },
  });

const statusNow = async (): Promise<string> => {
  const [row] = await db
    .select({ status: payments.status })
    .from(payments)
    .where(eq(payments.id, paymentId));
  return row!.status;
};

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated, seeded throwaway database. Set DATABASE_URL.');
  }
  restoreSecret = config.payments.safepay.webhookSecret;
  restoreApiKey = config.payments.safepay.apiKey;
  (config.payments.safepay as { webhookSecret?: string }).webhookSecret = SECRET;
  (config.payments.safepay as { apiKey?: string }).apiKey = API_KEY;

  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  const [store] = await db.select({ id: stores.id }).from(stores).limit(1);

  const [order] = await db
    .insert(orders)
    .values({
      userId: user!.id,
      storeId: store!.id,
      orderNumber: `WHGUARD-${Date.now()}`,
      status: 'placed',
      subtotal: 12_345,
      deliveryFee: 0,
      total: 12_345,
      paymentMethod: PaymentMethod.Online,
      // A snapshot, not a reference — the order keeps where it went even if the
      // address is later edited or deleted.
      deliveryAddress: {
        label: 'home',
        line1: 'Webhook guard fixture',
        area: 'DHA Peshawar',
        city: 'Peshawar',
        latitude: 33.9793,
        longitude: 71.6903,
      },
    })
    .returning({ id: orders.id });
  orderId = order!.id;

  const [payment] = await db
    .insert(payments)
    .values({
      orderId,
      method: PaymentMethod.Online,
      provider: 'safepay',
      status: PaymentStatus.Pending,
      amount: 12_345,
      idempotencyKey: `pay_${orderId}`,
    })
    .returning({ id: payments.id });
  paymentId = payment!.id;
});

after(async () => {
  (config.payments.safepay as { webhookSecret?: string }).webhookSecret = restoreSecret;
  (config.payments.safepay as { apiKey?: string }).apiKey = restoreApiKey;
  // Cascades to the payment row.
  await db.delete(orders).where(eq(orders.id, orderId));
  await close();
  await closeDb();
  await closeRedis();
});

describe('the amount on a webhook must match what we charged', () => {
  it('refuses one claiming a different figure', async () => {
    await post(event({}, { amount: 999_999 }));
    assert.equal(await statusNow(), PaymentStatus.Pending, 'a mismatched amount must not pay it');
  });

  it('refuses one that is 100x out', async () => {
    // The shape a units mistake would take, on either side of the wire.
    await post(event({}, { amount: 1_234_500 }));
    assert.equal(await statusNow(), PaymentStatus.Pending);
  });

  it('accepts the right figure', async () => {
    await post(event());
    assert.equal(await statusNow(), PaymentStatus.Paid);
  });
});

describe('a paid payment is never un-paid', () => {
  it('ignores a failure that arrives after the success', async () => {
    // Out-of-order delivery is normal with a retry queue. The order may already
    // have been picked by the time this lands.
    assert.equal(await statusNow(), PaymentStatus.Paid, 'precondition: already paid');

    const status = await post(
      event({ type: 'payment.failed' }, { state: 'TRACKER_ENROLLED', amount: 12_345 }),
    );
    assert.equal(status, 200, 'still acknowledged, so they stop retrying');
    assert.equal(await statusNow(), PaymentStatus.Paid, 'but the payment stays paid');
  });

  it('tolerates the same success being delivered twice', async () => {
    await post(event());
    assert.equal(await statusNow(), PaymentStatus.Paid);
  });
});

describe('an event for another Safepay account is refused', () => {
  it('does not act on a different merchant_api_key', async () => {
    /*
     * This is the sandbox-settles-a-live-order case. The signature is valid —
     * the test signs it with our secret — so only the account check stands
     * between a free test payment and a real order.
     */
    const status = await post(
      event({ merchant_api_key: 'sec_somebody-elses-sandbox' }, { amount: 12_345 }),
    );
    assert.equal(status, 200, 'acknowledged: retrying cannot change the key');
    assert.equal(await statusNow(), PaymentStatus.Paid, 'and our payment is untouched');
  });
});

describe('the status code decides whether they retry', () => {
  it('answers 401 to a signature it cannot verify', async () => {
    /*
     * 2xx means "delivered, stop retrying". Answering it to a webhook we could
     * not verify throws away the only notification we were going to get — and
     * the likeliest cause of an unverifiable signature is our own secret being
     * wrong, which is exactly the case where retries save us.
     */
    const res = await fetch(`${base}/api/v1/payments/webhooks/safepay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-sfpy-signature': 'deadbeef' },
      body: event(),
    });
    assert.equal(res.status, 401);
  });

  it('answers 401 when the signature header is missing entirely', async () => {
    const res = await fetch(`${base}/api/v1/payments/webhooks/safepay`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: event(),
    });
    assert.equal(res.status, 401);
  });

  it('answers 200 to something retrying cannot fix', async () => {
    // An unknown order will still be unknown in six hours. Acknowledged, so
    // their queue is not spent on it.
    const status = await post(
      event({}, { metadata: { order_id: '00000000-0000-4000-8000-000000000000' } }),
    );
    assert.equal(status, 200);
  });
});

describe('an unknown order id is not guessed at', () => {
  it('is refused rather than matched to something else', async () => {
    const status = await post(
      event({}, { metadata: { order_id: '11111111-1111-4111-8111-111111111111' } }),
    );
    assert.equal(status, 200, 'acknowledged so they stop retrying a hopeless delivery');
    assert.equal(await statusNow(), PaymentStatus.Paid, 'and our payment is untouched');
  });
});
