import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { paisaToRapidAmount, rapidAmountToPaisa } from './rapid.provider';

/**
 * Paisa ↔ decimal rupees, for Rapid Gateway.
 *
 * Everything inside Haala is integer paisa; their `TXNAMT` is a decimal string
 * like `1500.00`. Getting the direction wrong charges a customer 100× or 1/100×
 * the right amount, and no type catches it — both sides are numbers. So the
 * conversion is a named function and this file is why it stays correct.
 *
 * The same reasoning, and nearly the same file, as `safepay.money.test.ts`.
 */
describe('paisaToRapidAmount', () => {
  it('converts whole rupees', () => {
    assert.equal(paisaToRapidAmount(150_000), '1500.00');
    assert.equal(paisaToRapidAmount(100), '1.00');
  });

  it('keeps both decimal places', () => {
    // A string, not a number: `String(1500)` would send "1500", and their
    // documented format is "1500.00".
    assert.equal(paisaToRapidAmount(12_345), '123.45');
    assert.equal(paisaToRapidAmount(12_305), '123.05');
    assert.equal(paisaToRapidAmount(5), '0.05');
  });

  it('handles zero', () => {
    assert.equal(paisaToRapidAmount(0), '0.00');
  });

  it('refuses anything that is not a whole number of paisa', () => {
    // A fractional paisa means a bug upstream — arithmetic on a float
    // somewhere — and silently rounding it would hide that.
    assert.throws(() => paisaToRapidAmount(150.5));
    assert.throws(() => paisaToRapidAmount(-100));
    assert.throws(() => paisaToRapidAmount(Number.NaN));
  });

  it('survives a round trip at values where floats misbehave', () => {
    // 0.1 + 0.2 territory: these are the amounts where a naive `* 100` drifts.
    for (const paisa of [1, 5, 99, 100, 101, 1999, 12_345, 99_999, 150_000, 999_999]) {
      assert.equal(
        rapidAmountToPaisa(paisaToRapidAmount(paisa)),
        paisa,
        `${paisa} paisa did not survive the round trip`,
      );
    }
  });
});

describe('rapidAmountToPaisa', () => {
  it('reads the decimal their webhook sends', () => {
    // Their payload shows `"amount": 1500.00` — a JSON number, not a string.
    assert.equal(rapidAmountToPaisa(1500), 150_000);
    assert.equal(rapidAmountToPaisa(123.45), 12_345);
    assert.equal(rapidAmountToPaisa('123.45'), 12_345);
  });

  it('rounds rather than truncates', () => {
    // 123.455 × 100 is 12345.499999999998 in binary floating point. Truncating
    // would lose a paisa on a genuine amount.
    assert.equal(rapidAmountToPaisa(123.455), 12_346);
    assert.equal(rapidAmountToPaisa(0.07), 7);
  });

  it('refuses a value that is not a number', () => {
    assert.throws(() => rapidAmountToPaisa('not-a-number'));
  });
});
