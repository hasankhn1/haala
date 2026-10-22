import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { contactPhone } from './user.repository';

/**
 * The rider's "Call" button once dialled `users.phone`, which is null for
 * every email, Google and Apple signup — so it opened an empty dialer for
 * exactly the customers who had typed a number in at checkout.
 */
describe('contactPhone', () => {
  it('prefers the delivery contact over the login phone', () => {
    assert.equal(contactPhone({ deliveryPhone: '+923001112222', phone: '+923009998888' }), '+923001112222');
  });

  it('uses the delivery contact when there is no login phone', () => {
    assert.equal(contactPhone({ deliveryPhone: '+923001112222', phone: null }), '+923001112222');
  });

  it('falls back to the login phone for accounts that predate the split', () => {
    assert.equal(contactPhone({ deliveryPhone: null, phone: '+923009998888' }), '+923009998888');
  });
});
