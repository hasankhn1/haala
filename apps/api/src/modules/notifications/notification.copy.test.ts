import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BODY_MAX, copy, TITLE_MAX, type Copy } from './notification.copy';

/**
 * The design's copy rules, held against every template.
 *
 * Values are the long end of realistic rather than the comp's samples: a
 * five-digit order total, the longest seeded store name, a two-word rider name.
 * A title that fits with "Salman" and "PKR 180" but not with "PKR 24,850" is a
 * title that truncates on the orders that matter most.
 */
const RIDER = 'Muhammad Abdullah';
const STORE = 'Haala DHA Phase 5 Dark Store';
const ORDER = 'HAALA-7K2Q9Z';
const AMOUNT = 2_485_000; // PKR 24,850
const AT = new Date('2026-09-24T15:14:00Z'); // 8:14 PM in Peshawar

const all: Copy[] = [
  copy.riderAssigned(RIDER, STORE),
  copy.riderAssigned(null, STORE),
  copy.outForDelivery(RIDER),
  copy.outForDelivery(null),
  copy.arriving(RIDER),
  copy.arriving(null),
  copy.arrived(RIDER),
  copy.delivered(13, 24, AT),
  copy.delivered(null, 1, AT),
  copy.orderCancelled(ORDER),
  copy.deliveryFailed(ORDER),
  copy.paymentReceived(AMOUNT, ORDER),
  copy.paymentFailed(AMOUNT, ORDER),
  copy.refundIssued(AMOUNT),
];

describe('every template fits the design', () => {
  for (const c of all) {
    it(`${c.type}: "${c.title}"`, () => {
      assert.ok(c.title.length <= TITLE_MAX, `title is ${c.title.length} chars`);
      assert.ok(c.body.length <= BODY_MAX, `body is ${c.body.length} chars`);
      assert.doesNotMatch(`${c.title} ${c.body}`, /!!|\{|\}|undefined|null/);
      assert.doesNotMatch(`${c.title} ${c.body}`, /\p{Extended_Pictographic}/u, 'no emoji');
      assert.doesNotMatch(c.title, /\b[A-Z]{4,}\b(?!-)/, 'no shouting');
    });
  }
});

describe('missing values fall back as the design specifies', () => {
  it('names the rider by first name only', () => {
    assert.equal(copy.riderAssigned(RIDER, STORE).title, 'Muhammad is your rider');
    assert.match(copy.outForDelivery(RIDER).body, /^Muhammad has left the store/);
  });

  it('says "Your rider" when there is no name', () => {
    assert.match(copy.outForDelivery(null).body, /^Your rider has left the store/);
    assert.match(copy.outForDelivery('   ').body, /^Your rider has left the store/);
    assert.equal(copy.arrived(null).title, 'Your rider has arrived');
  });

  it('drops the duration rather than printing a placeholder', () => {
    assert.equal(copy.delivered(null, 3, AT).title, 'Delivered');
    assert.equal(copy.delivered(0, 3, AT).title, 'Delivered');
    assert.equal(copy.delivered(13, 3, AT).title, 'Delivered in 13 min');
    assert.equal(copy.delivered(185, 3, AT).title, 'Delivered', 'a slow order does not brag');
  });

  it('gives the hand-over time on the Peshawar clock', () => {
    assert.match(copy.delivered(13, 1, AT).body, /1 item handed over at 8:14 PM\.$/);
  });

  it('prints money the way the rest of the app does', () => {
    assert.equal(copy.refundIssued(18_000).title, 'Refund issued · PKR 180');
  });
});
