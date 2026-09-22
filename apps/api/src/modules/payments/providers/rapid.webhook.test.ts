import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { PaymentStatus } from '@haala/shared';
import { config } from '../../../config';
import { mapRapidStatus, rapidProvider } from './rapid.provider';

/**
 * The Rapid Gateway webhook — the only thing that proves a customer paid.
 *
 * Their hosted checkout returns the browser to `SUCCESS_URL` whether the money
 * moved or not (a pending wallet approval lands there too, and in LIVE the URL
 * carries no parameters at all). So this handler is the trust boundary, and
 * every test below is about refusing something rather than accepting it.
 *
 * The signature scheme is theirs, and two details in it are easy to get wrong:
 * the hash covers `timestamp + "." + rawBody`, and the hex is **uppercase**.
 */
const SECRET = 'test-webhook-secret';

/** Their payload shape, from the documentation. */
const payload = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    eventId: 'evt_9f2c',
    eventType: 'transaction.completed',
    source: 'ORCHESTRATOR',
    merchantId: 1679,
    gatewayTxnRef: 'RG-7841',
    merchantTransactionId: 'pay_11111111-2222-3333-4444-555555555555',
    status: 'SUCCESS',
    amount: 1500.0,
    currency: 'PKR',
    environment: 'TEST',
    occurredAt: '2026-07-20T09:15:00Z',
    ...over,
  });

const sign = (body: string, timestamp: number, secret = SECRET): string =>
  createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex').toUpperCase();

const deliver = (body: string, opts: { timestamp?: number; signature?: string } = {}) => {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  return rapidProvider.handleWebhook({
    headers: {
      'x-rapidgateway-signature': opts.signature ?? sign(body, timestamp),
      'x-rapidgateway-timestamp': String(timestamp),
      'x-rapidgateway-event': 'transaction.completed',
    },
    rawBody: Buffer.from(body, 'utf8'),
  });
};

/** The config is frozen at import, so the secret is swapped for the suite. */
let restore: string | undefined;
before(() => {
  restore = config.payments.rapid.webhookSecret;
  (config.payments.rapid as { webhookSecret?: string }).webhookSecret = SECRET;
});
after(() => {
  (config.payments.rapid as { webhookSecret?: string }).webhookSecret = restore;
});

describe('a valid webhook is accepted', () => {
  it('reports the basket id, the gateway reference, the status and the amount', async () => {
    const body = payload();
    const result = await deliver(body);

    assert.equal(result.handled, true);
    // Their `merchantTransactionId` is the BASKET_ID we submitted, which is the
    // payment's idempotency key — the service resolves the order from it.
    assert.equal(result.idempotencyKey, 'pay_11111111-2222-3333-4444-555555555555');
    assert.equal(result.providerRef, 'RG-7841');
    assert.equal(result.status, PaymentStatus.Paid);
    // Converted back to paisa so the service can compare it against what we
    // charged. 1500.00 rupees is 150000 paisa.
    assert.equal(result.amount, 150_000);
  });

  it('accepts a lowercase signature, since only the bytes matter', async () => {
    const body = payload();
    const timestamp = Math.floor(Date.now() / 1000);
    const lower = sign(body, timestamp).toLowerCase();
    assert.equal((await deliver(body, { timestamp, signature: lower })).handled, true);
  });
});

describe('an invalid webhook is refused', () => {
  it('refuses a signature made with the wrong secret', async () => {
    const body = payload();
    const timestamp = Math.floor(Date.now() / 1000);
    const forged = sign(body, timestamp, 'not-the-secret');
    assert.equal((await deliver(body, { timestamp, signature: forged })).handled, false);
  });

  it('refuses a body that changed after signing', async () => {
    // The attack this stops: take a real PKR 1 notification and edit it into a
    // PKR 10,000 one.
    const original = payload({ amount: 1.0 });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = sign(original, timestamp);
    const tampered = payload({ amount: 10_000.0 });
    assert.equal((await deliver(tampered, { timestamp, signature })).handled, false);
  });

  it('refuses a signature that does not cover the timestamp', async () => {
    // Signing the body alone is the obvious mistake, and it would let a captured
    // signature be replayed with any timestamp at all.
    const body = payload();
    const timestamp = Math.floor(Date.now() / 1000);
    const bodyOnly = createHmac('sha256', SECRET).update(body, 'utf8').digest('hex').toUpperCase();
    assert.equal((await deliver(body, { timestamp, signature: bodyOnly })).handled, false);
  });

  it('refuses anything older than the five-minute window', async () => {
    const body = payload();
    const stale = Math.floor(Date.now() / 1000) - 301;
    assert.equal((await deliver(body, { timestamp: stale })).handled, false);
  });

  it('accepts something just inside the window', async () => {
    const body = payload();
    const recent = Math.floor(Date.now() / 1000) - 290;
    assert.equal((await deliver(body, { timestamp: recent })).handled, true);
  });

  it('refuses a delivery with no signature headers at all', async () => {
    const result = await rapidProvider.handleWebhook({
      headers: {},
      rawBody: Buffer.from(payload(), 'utf8'),
    });
    assert.equal(result.handled, false);
  });

  it('refuses a payload with no basket id to match on', async () => {
    const body = payload({ merchantTransactionId: undefined });
    assert.equal((await deliver(body)).handled, false);
  });
});

describe('events we do not act on', () => {
  it('acknowledges refund events without treating them as payments', async () => {
    /*
     * Their refund events carry the **refundRef** in `merchantTransactionId`,
     * not the basket id. Matching them the same way would look up a payment
     * that does not exist — or, worse, one that happens to collide.
     */
    const body = payload({ eventType: 'refund.succeeded', merchantTransactionId: 'rfnd_abc' });
    assert.equal((await deliver(body)).handled, false);
  });

  it('does the same for reversals', async () => {
    const body = payload({ eventType: 'reversal.completed' });
    assert.equal((await deliver(body)).handled, false);
  });
});

describe('status mapping', () => {
  it('trusts the event name over the status field', () => {
    // The event is the more reliable of the two for a terminal outcome.
    assert.equal(mapRapidStatus('transaction.failed', 'SUCCESS'), PaymentStatus.Failed);
    assert.equal(mapRapidStatus('transaction.completed', undefined), PaymentStatus.Paid);
  });

  it('understands both of their vocabularies', () => {
    // Webhooks say SUCCESS; checkout sessions say SUCCEEDED.
    assert.equal(mapRapidStatus(undefined, 'SUCCESS'), PaymentStatus.Paid);
    assert.equal(mapRapidStatus(undefined, 'SUCCEEDED'), PaymentStatus.Paid);
    assert.equal(mapRapidStatus(undefined, 'PROCESSING'), PaymentStatus.Pending);
    assert.equal(mapRapidStatus(undefined, 'EXPIRED'), PaymentStatus.Failed);
    assert.equal(mapRapidStatus(undefined, 'INSUFFICIENT_BALANCE'), PaymentStatus.Failed);
  });

  it('falls back to pending, never to paid', () => {
    /*
     * The direction of the fallback is the whole point. A payment left pending
     * is recoverable — their webhook retries for six hours. One wrongly marked
     * paid ships groceries for free.
     */
    assert.equal(mapRapidStatus(undefined, 'SOMETHING_NEW'), PaymentStatus.Pending);
    assert.equal(mapRapidStatus(undefined, undefined), PaymentStatus.Pending);
    assert.equal(mapRapidStatus('transaction.unheard_of', undefined), PaymentStatus.Pending);
  });
});
