import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatPKR, rupees, toRupees } from './money';
import {
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  MAX_TIP,
  SERVICE_FEE,
  deliveryFeeFor,
  serviceFeeFor,
} from './pricing';

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

/**
 * Service fee and tip, added when the Basket comps' bill lines were built for
 * real. Same rule as everything else in this file: integer paisa, one
 * definition, pinned so an edit can't silently change what is charged.
 */
describe('serviceFeeFor', () => {
  it('is zero on an empty basket', () => {
    assert.equal(serviceFeeFor(0), 0);
  });

  it('is the configured fee on a real basket', () => {
    assert.equal(serviceFeeFor(rupees(500)), SERVICE_FEE);
  });

  it('is currently zero — the line exists, the charge does not', () => {
    // Guards a deliberate decision: the comps show a service-fee row, so it is
    // computed and stored on every order, but charging one is a pricing call.
    // If this fails someone set a rate — check that was intended, then update.
    assert.equal(SERVICE_FEE, 0);
  });
});

describe('order total', () => {
  // Mirrors `order.service.placeOrder`.
  const total = (subtotal: number, discount: number, tip: number) =>
    subtotal + deliveryFeeFor(subtotal) + serviceFeeFor(subtotal) + tip - discount;

  it('adds delivery, service and tip, then subtracts the discount', () => {
    const subtotal = rupees(800);
    assert.equal(
      total(subtotal, rupees(100), rupees(50)),
      subtotal + DELIVERY_FEE + rupees(50) - rupees(100),
    );
  });

  it('leaves the tip intact when a promo covers delivery', () => {
    // A code that quietly ate the rider's tip would be taking money from the
    // wrong person.
    const subtotal = rupees(800);
    assert.equal(total(subtotal, DELIVERY_FEE, rupees(50)) - subtotal, rupees(50));
  });

  it('caps the tip and rejects negatives', () => {
    const clamp = (n: number) => Math.min(Math.max(n, 0), MAX_TIP);
    assert.equal(clamp(rupees(50)), rupees(50));
    assert.equal(clamp(rupees(9_000)), MAX_TIP);
    assert.equal(clamp(-1), 0);
  });
});
