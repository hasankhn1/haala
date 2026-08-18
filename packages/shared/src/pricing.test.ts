import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPKR, rupees, toRupees } from './money';
import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD, deliveryFeeFor } from './pricing';

/**
 * The delivery-fee rule now has exactly one definition, imported by the API,
 * the customer app and promo quoting. These tests pin the threshold behaviour
 * so a future edit can't silently change what customers are charged.
 */
describe('deliveryFeeFor', () => {
  it('charges the flat fee below the threshold', () => {
    assert.equal(deliveryFeeFor(0), DELIVERY_FEE);
    assert.equal(deliveryFeeFor(rupees(40)), DELIVERY_FEE);
    assert.equal(deliveryFeeFor(FREE_DELIVERY_THRESHOLD - 1), DELIVERY_FEE);
  });

  it('is free at and above the threshold', () => {
    // Boundary is inclusive: spending exactly Rs 2,000 earns free delivery.
    assert.equal(deliveryFeeFor(FREE_DELIVERY_THRESHOLD), 0);
    assert.equal(deliveryFeeFor(FREE_DELIVERY_THRESHOLD + 1), 0);
    assert.equal(deliveryFeeFor(rupees(10_000)), 0);
  });

  it('uses the documented amounts', () => {
    assert.equal(DELIVERY_FEE, rupees(79));
    assert.equal(FREE_DELIVERY_THRESHOLD, rupees(2000));
  });
});

describe('money helpers', () => {
  it('converts rupees to integer paisa', () => {
    assert.equal(rupees(1), 100);
    assert.equal(rupees(79), 7900);
    assert.equal(rupees(12.4), 1240);
    // Rounds rather than truncating, so 0.005 doesn't vanish.
    assert.equal(rupees(0.005), 1);
  });

  it('round-trips paisa through rupees', () => {
    for (const paisa of [1, 99, 7900, 200_000, 738_000]) {
      assert.equal(rupees(toRupees(paisa)), paisa);
    }
  });

  it('formats whole rupees for display', () => {
    assert.equal(formatPKR(124_000), 'PKR 1,240');
    assert.equal(formatPKR(7900), 'PKR 79');
    assert.equal(formatPKR(0), 'PKR 0');
  });

  it('formats decimals only when asked', () => {
    assert.equal(formatPKR(12_345, true), 'PKR 123.45');
  });
});
