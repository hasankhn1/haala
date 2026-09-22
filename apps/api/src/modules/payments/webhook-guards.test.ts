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
 * Two guards that live in `paymentService.handleWebhook`, so they protect every
 * gateway rather than whichever one happened to be written last.
 *
 * **The amount must match.** A webhook claiming a figure other than the one we
 * charged is either a bug at the gateway or somebody who has found the
 * endpoint. Neither should mark an order paid.
 *
 * **A paid payment never becomes unpaid.** Gateways retry — Rapid Gateway's
 * ladder runs 30s, 2m, 10m, 1h, 6h — and deliveries arrive out of order, so a
 * stale `transaction.failed` can legitimately land after a
 * `transaction.completed`. Re-applying a status is harmless; un-paying an order
 * that has already been picked is not.
 *
 * Driven through the real HTTP endpoint with real signatures, because the raw
 * body and the signature over it are half of what is being tested.
 */
const SECRET = 'guard-test-secret';

let base = '';
let close: () => Promise<void> = async () => {};
let paymentId = '';
let orderId = '';
let basketId = '';
let restoreSecret: string | undefined;

const post = async (body: string, timestamp = Math.floor(Date.now() / 1000)) => {
  const signature = createHmac('sha256', SECRET)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex')
    .toUpperCase();
  const res = await fetch(`${base}/api/v1/payments/webhooks/rapid`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-rapidgateway-signature': signature,
      'x-rapidgateway-timestamp': String(timestamp),
    },
    body,
  });
  return res.status;
};

const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    eventType: 'transaction.completed',
    merchantTransactionId: basketId,
    gatewayTxnRef: 'RG-TEST-1',
    status: 'SUCCESS',
    // 12,345 paisa — matches the payment row created below.
    amount: 123.45,
    currency: 'PKR',
    ...over,
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
  restoreSecret = config.payments.rapid.webhookSecret;
  (config.payments.rapid as { webhookSecret?: string }).webhookSecret = SECRET;

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
  basketId = `pay_${orderId}`;

  const [payment] = await db
    .insert(payments)
    .values({
      orderId,
      method: PaymentMethod.Online,
      provider: 'rapid',
      status: PaymentStatus.Pending,
      amount: 12_345,
      idempotencyKey: basketId,
    })
    .returning({ id: payments.id });
  paymentId = payment!.id;
});

after(async () => {
  (config.payments.rapid as { webhookSecret?: string }).webhookSecret = restoreSecret;
  // Cascades to the payment row.
  await db.delete(orders).where(eq(orders.id, orderId));
  await close();
  await closeDb();
  await closeRedis();
});

describe('the amount on a webhook must match what we charged', () => {
  it('refuses one claiming a different figure', async () => {
    await post(event({ amount: 9_999.99 }));
    assert.equal(await statusNow(), PaymentStatus.Pending, 'a mismatched amount must not pay it');
  });

  it('accepts the right figure', async () => {
    await post(event());
    assert.equal(await statusNow(), PaymentStatus.Paid);
  });
});

describe('a paid payment is never un-paid', () => {
  it('ignores a failure that arrives after the success', async () => {
    // Out-of-order delivery is normal with a six-hour retry ladder. The order
    // may already have been picked by the time this lands.
    assert.equal(await statusNow(), PaymentStatus.Paid, 'precondition: already paid');

    const status = await post(event({ eventType: 'transaction.failed', status: 'FAILED' }));
    assert.equal(status, 200, 'still acknowledged, so they stop retrying');
    assert.equal(await statusNow(), PaymentStatus.Paid, 'but the payment stays paid');
  });

  it('tolerates the same success being delivered twice', async () => {
    // They de-duplicate on `eventId`, but the same event can legitimately
    // arrive more than once and re-applying it must be harmless.
    await post(event());
    assert.equal(await statusNow(), PaymentStatus.Paid);
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
    const body = event();
    const res = await fetch(`${base}/api/v1/payments/webhooks/rapid`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-rapidgateway-signature': 'DEADBEEF',
        'x-rapidgateway-timestamp': String(Math.floor(Date.now() / 1000)),
      },
      body,
    });
    assert.equal(res.status, 401);
  });

  it('answers 200 to something retrying cannot fix', async () => {
    // An unknown reference will still be unknown in six hours. Acknowledged, so
    // their ladder is not spent on it.
    assert.equal(await post(event({ merchantTransactionId: 'pay_still-not-a-thing' })), 200);
  });
});

describe('an unknown basket id is not guessed at', () => {
  it('is refused rather than matched to something else', async () => {
    const status = await post(event({ merchantTransactionId: 'pay_does-not-exist' }));
    assert.equal(status, 200, 'acknowledged so they stop retrying a hopeless delivery');
    assert.equal(await statusNow(), PaymentStatus.Paid, 'and our payment is untouched');
  });
});
