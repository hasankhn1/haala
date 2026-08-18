import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rupees } from '@haala/shared';
import type { Promotion } from '../../db/schema';
import { __priceForTests as price } from './promotion.service';

/**
 * The pure pricing branch of promo quoting — no database involved.
 *
 * Worth testing directly because this function decides what a customer is
 * charged, and its edge cases (caps, clamps, an already-free delivery) are
 * exactly the ones that are awkward to reach through the HTTP surface.
 */
const promo = (over: Partial<Promotion>): Promotion =>
  ({
    id: 'p1',
    code: 'TEST',
    type: 'fixed_amount',
    value: 0,
    minOrderTotal: null,
    maxDiscount: null,
    usageLimit: null,
    perUserLimit: null,
    usedCount: 0,
    startsAt: null,
    endsAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }) as Promotion;

const FEE = rupees(79);

describe('promotion pricing — free_delivery', () => {
  it('zeroes the fee and leaves the discount at zero', () => {
    // The receipt must read "Delivery: Free", not "Discount: Rs 79".
    const r = price(promo({ type: 'free_delivery' }), rupees(500), FEE);
    assert.equal(r.deliveryFee, 0);
    assert.equal(r.discount, 0);
  });

  it('is a no-op when delivery was already free', () => {
    const r = price(promo({ type: 'free_delivery' }), rupees(5000), 0);
    assert.equal(r.deliveryFee, 0);
    assert.equal(r.discount, 0);
    assert.match(r.message, /already free/i);
  });
});

describe('promotion pricing — percentage', () => {
  it('takes the stated percentage off the subtotal', () => {
    const r = price(promo({ type: 'percentage', value: 10 }), rupees(1000), FEE);
    assert.equal(r.discount, rupees(100));
    // A percentage promo must not touch the delivery fee.
    assert.equal(r.deliveryFee, FEE);
  });

  it('respects maxDiscount', () => {
    const r = price(
      promo({ type: 'percentage', value: 10, maxDiscount: rupees(300) }),
      rupees(7000),
      FEE,
    );
    // 10% of 7000 is 700, capped to 300.
    assert.equal(r.discount, rupees(300));
  });

  it('does not cap when under the ceiling', () => {
    const r = price(
      promo({ type: 'percentage', value: 10, maxDiscount: rupees(300) }),
      rupees(1000),
      FEE,
    );
    assert.equal(r.discount, rupees(100));
  });

  it('floors rather than rounding up, so we never over-discount', () => {
    // 10% of 1999 paisa = 199.9 → 199.
    const r = price(promo({ type: 'percentage', value: 10 }), 1999, FEE);
    assert.equal(r.discount, 199);
  });

  it('never exceeds the subtotal even at 100%', () => {
    const r = price(promo({ type: 'percentage', value: 100 }), rupees(500), FEE);
    assert.equal(r.discount, rupees(500));
    // The total would be fee-only, never negative.
    assert.ok(rupees(500) + r.deliveryFee - r.discount >= 0);
  });
});

describe('promotion pricing — fixed_amount', () => {
  it('discounts the stated paisa', () => {
    const r = price(promo({ type: 'fixed_amount', value: rupees(200) }), rupees(1000), FEE);
    assert.equal(r.discount, rupees(200));
    assert.equal(r.deliveryFee, FEE);
  });

  it('clamps a discount larger than the subtotal', () => {
    // Rs 200 off a Rs 40 basket must not produce a negative total.
    const r = price(promo({ type: 'fixed_amount', value: rupees(200) }), rupees(40), FEE);
    assert.equal(r.discount, rupees(40));
    assert.ok(rupees(40) + r.deliveryFee - r.discount >= 0);
  });

  it('applies maxDiscount as well as the subtotal clamp', () => {
    const r = price(
      promo({ type: 'fixed_amount', value: rupees(500), maxDiscount: rupees(100) }),
      rupees(1000),
      FEE,
    );
    assert.equal(r.discount, rupees(100));
  });
});

describe('promotion pricing — invariants across every branch', () => {
  const cases = [
    promo({ type: 'free_delivery' }),
    promo({ type: 'percentage', value: 25 }),
    promo({ type: 'percentage', value: 100, maxDiscount: rupees(50) }),
    promo({ type: 'fixed_amount', value: rupees(1000) }),
  ];

  it('never produces a negative total or a negative discount', () => {
    for (const p of cases) {
      for (const subtotal of [0, 1, rupees(40), rupees(500), rupees(5000)]) {
        for (const fee of [0, FEE]) {
          const r = price(p, subtotal, fee);
          assert.ok(r.discount >= 0, `negative discount for ${p.type} @ ${subtotal}`);
          assert.ok(r.deliveryFee >= 0, `negative fee for ${p.type} @ ${subtotal}`);
          assert.ok(
            subtotal + r.deliveryFee - r.discount >= 0,
            `negative total for ${p.type} @ subtotal ${subtotal}, fee ${fee}`,
          );
          assert.ok(
            r.discount <= subtotal,
            `discount ${r.discount} exceeds subtotal ${subtotal} for ${p.type}`,
          );
        }
      }
    }
  });

  it('returns integer paisa, never a fraction', () => {
    for (const p of cases) {
      for (const subtotal of [1, 7, 1999, 33_333]) {
        const r = price(p, subtotal, FEE);
        assert.ok(Number.isInteger(r.discount), `${p.type} produced ${r.discount}`);
        assert.ok(Number.isInteger(r.deliveryFee), `${p.type} produced ${r.deliveryFee}`);
      }
    }
  });
});
