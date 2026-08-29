import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { availableToSell } from './inventory.repository';

/**
 * `availableToSell` is the single rule deciding whether a line can be bought.
 *
 * Worth testing directly because three call sites depend on it and only one of
 * them is visible: the catalogue merely *hides* a sold-out item, but
 * `order.service.ts` uses this same function inside the placement transaction
 * to refuse it. If the suspension flag were honoured in the listing alone, an
 * item already sitting in someone's cart could still be ordered after ops
 * pulled it — which is the bug this flag exists to prevent.
 */
const row = (over: Partial<Parameters<typeof availableToSell>[0]> = {}) => ({
  quantityAvailable: 10,
  quantityReserved: 0,
  isAvailable: true,
  ...over,
});

describe('availableToSell', () => {
  it('is on-hand minus reserved', () => {
    assert.equal(availableToSell(row({ quantityAvailable: 10, quantityReserved: 3 })), 7);
  });

  it('never goes negative when reservations exceed stock', () => {
    assert.equal(availableToSell(row({ quantityAvailable: 2, quantityReserved: 5 })), 0);
  });

  it('is zero while ops has the line suspended, however much stock exists', () => {
    assert.equal(availableToSell(row({ quantityAvailable: 500, isAvailable: false })), 0);
  });

  it('returns the real figure again once the line is restored', () => {
    // The point of the flag over setting stock to 0: the count survives, so
    // produce pulled for a day comes back without anyone retyping it.
    const suspended = row({ quantityAvailable: 24, isAvailable: false });
    assert.equal(availableToSell(suspended), 0);
    assert.equal(availableToSell({ ...suspended, isAvailable: true }), 24);
  });

  it('still subtracts reservations after being restored', () => {
    assert.equal(
      availableToSell(row({ quantityAvailable: 24, quantityReserved: 4, isAvailable: true })),
      20,
    );
  });
});
