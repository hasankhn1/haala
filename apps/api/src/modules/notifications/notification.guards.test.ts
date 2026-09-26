import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeNotificationCategories,
  NOTIFICATION_CHANNEL,
  NotificationCategory,
  notificationTypesIn,
} from '@haala/shared';
import { channelFor } from './notification.service';

/**
 * Two guards that fail silently, which is why they are worth pinning: an
 * Android channel that does not exist on the handset drops the notification
 * with nothing in any log, and a category with no types offers the customer a
 * filter that can never match.
 */
describe('only categories that can actually send are offered', () => {
  it('excludes brand, because no type maps to it yet', () => {
    const active = activeNotificationCategories();
    assert.ok(
      !active.includes(NotificationCategory.Brand),
      'a Brands chip that always answers "Nothing here yet" reads as a broken inbox',
    );
  });

  it('includes every category that does have types', () => {
    for (const c of [
      NotificationCategory.Order,
      NotificationCategory.Payment,
      NotificationCategory.Offer,
      NotificationCategory.Service,
    ]) {
      assert.ok(activeNotificationCategories().includes(c), `${c} should be offered`);
    }
  });

  it('is derived, so brand returns on its own the day it has types', () => {
    // The property that makes this self-healing rather than a hardcoded
    // omission somebody has to remember to undo.
    for (const c of activeNotificationCategories()) {
      assert.ok(notificationTypesIn(c).length > 0, `${c} is offered but carries nothing`);
    }
  });
});

describe('the Android channel is chosen per handset', () => {
  const PAYMENTS = NOTIFICATION_CHANNEL.payment;

  it('falls back to default for a build that never created the channel', () => {
    /*
     * The silent-loss case. A handset on the previous APK created only
     * `default`; Android drops a notification whose channel does not exist, so
     * targeting `payments` there loses exactly the ones that matter most.
     */
    assert.equal(channelFor({ channels: null }, PAYMENTS), 'default');
    assert.equal(channelFor({ channels: '' }, PAYMENTS), 'default');
  });

  it('uses the channel when the handset reported it', () => {
    assert.equal(channelFor({ channels: `default,${PAYMENTS},offers` }, PAYMENTS), PAYMENTS);
  });

  it('falls back when the handset reported a different set', () => {
    assert.equal(channelFor({ channels: 'default,offers' }, PAYMENTS), 'default');
  });

  it('never rejects default itself', () => {
    // Every build has it, including ones that report nothing.
    assert.equal(channelFor({ channels: null }, 'default'), 'default');
    assert.equal(channelFor({ channels: null }, undefined), 'default');
  });

  it('does not match a channel by prefix', () => {
    // `split(',')` rather than `includes` on the raw string: "pay" must not
    // satisfy "payments", and "payments_v2" must not satisfy "payments".
    assert.equal(channelFor({ channels: 'payments_v2' }, PAYMENTS), 'default');
  });
});
