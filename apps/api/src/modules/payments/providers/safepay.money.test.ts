import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rupees } from '@haala/shared';
import {
  __mapStatusForTests as mapStatus,
  paisaToSafepayAmount,
  safepayAmountToPaisa,
} from './safepay.provider';

/**
 * The unit boundary between haala (integer paisa) and Safepay (decimal rupees).
 *
 * This is the highest-consequence arithmetic in the codebase: getting it wrong
 * by a factor of 100 either charges a customer 100× or gives the order away.
 * Hence a test file for two one-line functions.
 */
describe('Safepay money conversion', () => {
  it('converts paisa to rupees, not the other way round', () => {
    // The direction of the error that matters: 79 rupees must not become 7900.
    assert.equal(paisaToSafepayAmount(7900), 79);
    assert.equal(paisaToSafepayAmount(100), 1);
    assert.equal(paisaToSafepayAmount(1), 0.01);
  });

  it('keeps exactly two decimal places', () => {
    assert.equal(paisaToSafepayAmount(123_45), 123.45);
    assert.equal(paisaToSafepayAmount(99), 0.99);
    assert.equal(paisaToSafepayAmount(1_000_050), 10000.5);
  });

  it('handles zero', () => {
    assert.equal(paisaToSafepayAmount(0), 0);
  });

  it('agrees with the shared rupees() helper', () => {
    for (const amount of [1, 79, 250, 1999, 100_000]) {
      assert.equal(paisaToSafepayAmount(rupees(amount)), amount);
    }
  });

  it('round-trips through both directions without drift', () => {
    // Realistic order totals, including ones that stress float representation.
    for (const paisa of [1, 99, 100, 7900, 123_45, 200_000, 738_000, 999_999_99]) {
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

  it('converts a rupee decimal back to integer paisa', () => {
    assert.equal(safepayAmountToPaisa(79), 7900);
    assert.equal(safepayAmountToPaisa(123.45), 12345);
    // 0.1 + 0.2 territory — must not land on 1229.9999.
    assert.equal(safepayAmountToPaisa(12.3), 1230);
  });
});

describe('Safepay status mapping', () => {
  it('maps the terminal success states to paid', () => {
    for (const state of ['TRACKER_ENDED', 'PAID', 'paid', 'COMPLETED']) {
      assert.equal(mapStatus(state), 'paid', `${state} should be paid`);
    }
  });

  it('maps rejections to failed', () => {
    for (const state of ['TRACKER_REJECTED', 'FAILED', 'failed', 'cancelled']) {
      assert.equal(mapStatus(state), 'failed', `${state} should be failed`);
    }
  });

  it('falls back to pending for anything unrecognised', () => {
    // The direction of this default is the whole point: a state we don't
    // understand must never be treated as paid, or we ship groceries for free.
    // Pending is recoverable — the status can be polled again.
    for (const state of ['SOMETHING_NEW', 'TRACKER_WEIRD', '', 'PAID_MAYBE']) {
      assert.equal(mapStatus(state), 'pending', `${state} should fall back to pending`);
    }
  });

  it('treats a missing state as pending, not paid', () => {
    assert.equal(mapStatus(undefined), 'pending');
  });
});
