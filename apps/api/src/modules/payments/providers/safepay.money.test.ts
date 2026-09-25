import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rupees } from '@haala/shared';
import {
  buildCheckoutUrl,
  mapSafepayStatus,
  paisaToSafepayAmount,
  safepayAmountToPaisa,
} from './safepay.provider';

/**
 * The unit boundary between Haala (integer paisa) and Safepay v3 (minor units).
 *
 * **They are the same unit, and that is exactly why this file exists.** Safepay
 * v1 took decimal rupees, Rapid Gateway took decimal rupees, and this file used
 * to assert `7900 → 79`. Anyone who remembers either will reach for a `/ 100`.
 * An identity function with a test is how that assumption stays written down;
 * delete the function and the next person has nothing to contradict.
 *
 * Getting it wrong by a factor of 100 either charges a customer 100× or gives
 * the order away.
 */
describe('Safepay money conversion', () => {
  it('does NOT divide by 100 — v3 amounts are minor units', () => {
    // The specific regression: 7,900 paisa is 7900, not 79. If this reads
    // `79`, somebody has ported the v1 or Rapid conversion back in.
    assert.equal(paisaToSafepayAmount(7900), 7900);
    assert.equal(paisaToSafepayAmount(100), 100);
    assert.equal(paisaToSafepayAmount(1), 1);
  });

  it('matches their own worked example', () => {
    // "if you wish to charge $100 … the amount will be 10000" — 100 major
    // units is 10000 minor ones, in any currency they support.
    assert.equal(paisaToSafepayAmount(rupees(100)), 10_000);
  });

  it('handles zero', () => {
    assert.equal(paisaToSafepayAmount(0), 0);
  });

  it('round-trips both directions without drift', () => {
    for (const paisa of [0, 1, 99, 100, 7900, 123_45, 200_000, 738_000, 999_999_99]) {
      assert.equal(
        safepayAmountToPaisa(paisaToSafepayAmount(paisa)),
        paisa,
        `round-trip failed for ${paisa} paisa`,
      );
    }
  });

  it('rejects non-integer paisa rather than silently rounding', () => {
    // A fractional paisa means money maths went wrong upstream; failing loudly
    // beats quietly charging a rounded amount.
    assert.throws(() => paisaToSafepayAmount(12.5));
    assert.throws(() => paisaToSafepayAmount(Number.NaN));
  });

  it('rejects negative amounts', () => {
    assert.throws(() => paisaToSafepayAmount(-100));
  });

  it('rejects a decimal coming back from them', () => {
    /*
     * The tell that this assumption has broken. If a webhook ever carries
     * `123.45`, they have moved to major units and every amount we send is
     * 100× — better to throw at the boundary than to let the service's amount
     * check quietly refuse every payment as a mismatch.
     */
    assert.throws(() => safepayAmountToPaisa(123.45));
    assert.throws(() => safepayAmountToPaisa('not-a-number'));
  });

  it('reads a numeric string, since JSON numbers are not guaranteed', () => {
    assert.equal(safepayAmountToPaisa('12345'), 12_345);
  });
});

describe('Safepay status mapping', () => {
  it('maps only TRACKER_ENDED to paid', () => {
    assert.equal(mapSafepayStatus(undefined, 'TRACKER_ENDED'), 'paid');
    // Neighbouring states are mid-flight, not success.
    assert.equal(mapSafepayStatus(undefined, 'TRACKER_AUTHORIZED'), 'authorized');
    assert.equal(mapSafepayStatus(undefined, 'TRACKER_ENROLLED'), 'pending');
    assert.equal(mapSafepayStatus(undefined, 'TRACKER_STARTED'), 'pending');
  });

  it('maps the dead-end states to failed', () => {
    for (const state of [
      'TRACKER_CANCELLED',
      'TRACKER_EXPIRED',
      'TRACKER_REVERSED',
      'TRACKER_VOIDED',
    ]) {
      assert.equal(mapSafepayStatus(undefined, state), 'failed', `${state} should be failed`);
    }
  });

  it('distinguishes a full refund from a partial one', () => {
    assert.equal(mapSafepayStatus('payment.refunded', 'TRACKER_REFUNDED'), 'refunded');
    assert.equal(
      mapSafepayStatus('payment.refunded', 'TRACKER_PARTIAL_REFUND'),
      'partially_refunded',
    );
  });

  it('lets the event name win over a mid-flight state', () => {
    /*
     * Their own `payment.failed` sample carries `"state": "TRACKER_ENROLLED"`,
     * which maps to pending. Reading the state there would leave every failed
     * payment sitting at pending forever, waiting for a webhook that already
     * arrived.
     */
    assert.equal(mapSafepayStatus('payment.failed', 'TRACKER_ENROLLED'), 'failed');
    assert.equal(mapSafepayStatus('payment.succeeded', 'TRACKER_ENDED'), 'paid');
    assert.equal(mapSafepayStatus('authorization.reversed', 'TRACKER_STARTED'), 'failed');
  });

  it('calls a disputed payment paid, because the money did arrive', () => {
    // We have no `disputed` status. Falling through to pending would say "still
    // waiting" about an order that was delivered and charged.
    assert.equal(mapSafepayStatus(undefined, 'TRACKER_DISPUTED'), 'paid');
  });

  it('falls back to pending for anything unrecognised', () => {
    // The direction of this default is the whole point: a state we do not
    // understand must never be treated as paid, or we ship groceries for free.
    // Pending is recoverable — the status can be polled again.
    for (const state of ['SOMETHING_NEW', 'TRACKER_WEIRD', '', 'TRACKER_ENDED_MAYBE']) {
      assert.equal(mapSafepayStatus(undefined, state), 'pending', `${state} → pending`);
    }
    assert.equal(mapSafepayStatus('some.new.event', undefined), 'pending');
    assert.equal(mapSafepayStatus(undefined, undefined), 'pending');
  });
});

describe('the checkout URL', () => {
  const base = {
    tracker: 'track_abc',
    tbt: 'passport-token',
    source: 'hosted' as const,
  };

  it('drops the api. subdomain in production', () => {
    /*
     * The asymmetry that would work all through sandbox testing and 404 on the
     * first live payment. Sandbox is `sandbox.api.getsafepay.com`; production
     * is `getsafepay.com`, NOT `api.getsafepay.com`.
     */
    const sandbox = buildCheckoutUrl({ ...base, environment: 'sandbox' });
    const production = buildCheckoutUrl({ ...base, environment: 'production' });

    assert.ok(sandbox.startsWith('https://sandbox.api.getsafepay.com/embedded/?'), sandbox);
    assert.ok(production.startsWith('https://getsafepay.com/embedded/?'), production);
    assert.ok(!production.includes('api.getsafepay.com'), 'production must not carry api.');
  });

  it('stamps the environment into the query too', () => {
    assert.ok(buildCheckoutUrl({ ...base, environment: 'sandbox' }).includes('environment=sandbox'));
  });

  it('omits optional parameters rather than sending "undefined"', () => {
    // `?user_id=undefined` is a string they would have to interpret, and the
    // one they would most likely interpret as a customer.
    const url = buildCheckoutUrl({ ...base, environment: 'sandbox' });
    assert.ok(!url.includes('undefined'), url);
    assert.ok(!url.includes('user_id='), url);
    assert.ok(!url.includes('redirect_url='), url);
  });

  it('percent-encodes the return URLs', () => {
    const url = buildCheckoutUrl({
      ...base,
      environment: 'sandbox',
      redirectUrl: 'https://haala.example/api/v1/payments/return/safepay?a=b',
      userId: 'cus_123',
    });
    // Unencoded, the `?a=b` would terminate our own query string and the
    // parameters after it would be read as the gateway's.
    assert.ok(url.includes('redirect_url=https%3A%2F%2Fhaala.example'), url);
    assert.ok(url.includes('%3Fa%3Db'), url);
    assert.ok(url.includes('user_id=cus_123'), url);
  });
});
