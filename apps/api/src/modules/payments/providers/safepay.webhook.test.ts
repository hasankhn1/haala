import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import { config } from '../../../config';
import { safepayProvider } from './safepay.provider';

/**
 * Webhook verification, at the provider rather than through HTTP.
 *
 * `webhook-guards.test.ts` drives the same endpoint over the wire to cover the
 * service's guards and needs a database for it. These are the provider's own
 * decisions — signature, account, mapping — and need nothing, so they run
 * everywhere and fail fast.
 *
 * The one that matters most is `retryable`. A 2xx tells Safepay the delivery
 * landed and to stop, so acknowledging a payload we could not verify discards
 * the only notification we were going to get — silently, on the first attempt,
 * if the secret were wrong.
 */
const SECRET = 'webhook-unit-secret';
const API_KEY = 'sec_unit-test-account';
const ORDER_ID = '7c1f0b4e-0a1a-4c2e-9f3a-2b6d5e8f9a01';

let restoreSecret: string | undefined;
let restoreApiKey: string | undefined;

before(() => {
  restoreSecret = config.payments.safepay.webhookSecret;
  restoreApiKey = config.payments.safepay.apiKey;
  (config.payments.safepay as { webhookSecret?: string }).webhookSecret = SECRET;
  (config.payments.safepay as { apiKey?: string }).apiKey = API_KEY;
});

after(() => {
  (config.payments.safepay as { webhookSecret?: string }).webhookSecret = restoreSecret;
  (config.payments.safepay as { apiKey?: string }).apiKey = restoreApiKey;
});

const body = (over: Record<string, unknown> = {}, dataOver: Record<string, unknown> = {}) =>
  JSON.stringify({
    token: 'evt_unit',
    version: '2.0.0',
    merchant_api_key: API_KEY,
    type: 'payment.succeeded',
    ...over,
    data: {
      tracker: 'track_unit',
      state: 'TRACKER_ENDED',
      amount: 45_000,
      currency: 'PKR',
      metadata: { order_id: ORDER_ID },
      ...dataOver,
    },
  });

const sign = (raw: string, secret = SECRET) =>
  createHmac('sha512', secret).update(raw, 'utf8').digest('hex');

const deliver = (raw: string, signature?: string) =>
  safepayProvider.handleWebhook({
    headers: signature === undefined ? {} : { 'x-sfpy-signature': signature },
    rawBody: Buffer.from(raw, 'utf8'),
  });

describe('Safepay webhook signatures', () => {
  it('accepts a correctly signed payload', async () => {
    const raw = body();
    const result = await deliver(raw, sign(raw));

    assert.equal(result.handled, true);
    assert.equal(result.orderId, ORDER_ID);
    assert.equal(result.providerRef, 'track_unit');
    assert.equal(result.status, 'paid');
    assert.equal(result.amount, 45_000);
  });

  it('is SHA-512, not SHA-256', async () => {
    /*
     * The single most likely way to get this wrong: v1 signed with SHA-256 and
     * the old provider in this same directory did too. A 256 signature is also
     * half the length, so it fails the length check before the compare.
     */
    const raw = body();
    const sha256 = createHmac('sha256', SECRET).update(raw, 'utf8').digest('hex');

    const result = await deliver(raw, sha256);
    assert.equal(result.handled, false);
    assert.equal(result.retryable, true);
  });

  it('rejects a tampered body and asks to be retried', async () => {
    const raw = body();
    const signature = sign(raw);
    // Same signature, a body claiming ten times the amount.
    const tampered = body({}, { amount: 450_000 });

    const result = await deliver(tampered, signature);
    assert.equal(result.handled, false);
    assert.equal(result.retryable, true, 'an unverifiable delivery must not be acknowledged');
  });

  it('rejects a signature made with the wrong secret', async () => {
    const raw = body();
    const result = await deliver(raw, sign(raw, 'somebody-elses-secret'));

    assert.equal(result.handled, false);
    assert.equal(result.retryable, true);
  });

  it('rejects a missing header without throwing', async () => {
    // `timingSafeEqual` throws on a length mismatch, so the length check has to
    // come first or a bad signature becomes a 500 instead of a 401.
    const result = await deliver(body());
    assert.equal(result.handled, false);
    assert.equal(result.retryable, true);
  });

  it('accepts an upper-case signature', async () => {
    // Nothing in their docs pins the case, and hex is hex.
    const raw = body();
    const result = await deliver(raw, sign(raw).toUpperCase());
    assert.equal(result.handled, true);
  });

  it('asks to be retried when no secret is configured at all', async () => {
    (config.payments.safepay as { webhookSecret?: string }).webhookSecret = undefined;
    try {
      const raw = body();
      const result = await deliver(raw, sign(raw));
      // Somebody can still set the secret; their queue is what buys the time.
      assert.equal(result.handled, false);
      assert.equal(result.retryable, true);
    } finally {
      (config.payments.safepay as { webhookSecret?: string }).webhookSecret = SECRET;
    }
  });
});

describe('Safepay webhook account binding', () => {
  it('refuses an event minted by a different merchant account', async () => {
    /*
     * This is the sandbox-settles-a-live-order case, and the signature here is
     * *valid* — so nothing else stands in the way. Their payload has no
     * environment field, but sandbox and live are separate accounts with
     * separate keys, so the key pins both.
     */
    const raw = body({ merchant_api_key: 'sec_somebody-elses-sandbox' });
    const result = await deliver(raw, sign(raw));

    assert.equal(result.handled, false);
    assert.notEqual(result.retryable, true, 'the key will be the same on every retry');
  });

  it('still handles a payload that omits the key', async () => {
    // Absent is not the same as wrong; only a mismatch is refused.
    const raw = body({ merchant_api_key: undefined });
    const result = await deliver(raw, sign(raw));
    assert.equal(result.handled, true);
  });
});

describe('Safepay webhook payload reading', () => {
  it('resolves the order from metadata, which is where we put it', async () => {
    const raw = body({}, { metadata: { order_id: ORDER_ID, source: 'whatever' } });
    const result = await deliver(raw, sign(raw));
    assert.equal(result.orderId, ORDER_ID);
  });

  it('refuses an event with no order id rather than guessing', async () => {
    const raw = body({}, { metadata: {} });
    const result = await deliver(raw, sign(raw));

    assert.equal(result.handled, false);
    assert.notEqual(result.retryable, true, 'retrying will not grow a metadata key');
  });

  it('does not acknowledge invalid JSON as handled', async () => {
    const raw = '{"type":"payment.succeeded",';
    const result = await deliver(raw, sign(raw));
    assert.equal(result.handled, false);
  });

  it('passes the amount through in paisa so the service can check it', async () => {
    const raw = body({}, { amount: 12_345 });
    const result = await deliver(raw, sign(raw));
    // Unchanged, because both sides are minor units. A `/ 100` here would make
    // every real payment look like a mismatch and quietly refuse them all.
    assert.equal(result.amount, 12_345);
  });

  it('omits the amount entirely when they do not send one', async () => {
    // `payment.failed` carries no amount. Sending 0 would collide with the
    // service's amount check and refuse a legitimate failure.
    const raw = body({ type: 'payment.failed' }, { state: 'TRACKER_ENROLLED', amount: undefined });
    const result = await deliver(raw, sign(raw));

    assert.equal(result.handled, true);
    assert.equal(result.amount, undefined);
    assert.equal(result.status, 'failed');
  });
});
