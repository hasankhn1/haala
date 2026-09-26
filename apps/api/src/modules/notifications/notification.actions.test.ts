import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  activeNotificationCategories,
  NOTIFICATION_ACTION,
  NOTIFICATION_CATEGORY_ID,
  NotificationCategory,
} from '@haala/shared';

/**
 * The action row from the comp.
 *
 * The failure this pins is silent in both directions: a push carrying a
 * `categoryId` the app never registered renders with no buttons, and a
 * registered category nothing ever sends to is dead weight. Neither logs.
 */
describe('notification action categories', () => {
  it('gives order notifications a category id', () => {
    assert.equal(NOTIFICATION_CATEGORY_ID.order, 'haala.order');
  });

  it('gives nothing else one, because nothing else has a destination', () => {
    // The comp draws "Try again" on a failed payment and "Add to cart" on an
    // offer. Neither exists in the app, and a button that opens a screen which
    // cannot do the thing is worse than no button.
    for (const c of [
      NotificationCategory.Payment,
      NotificationCategory.Offer,
      NotificationCategory.Service,
      NotificationCategory.Brand,
    ]) {
      assert.equal(NOTIFICATION_CATEGORY_ID[c], undefined, `${c} should have no actions`);
    }
  });

  it('only attaches a category to something that can actually be sent', () => {
    // A category id on a notification category with no types would never fire.
    for (const c of Object.keys(NOTIFICATION_CATEGORY_ID) as NotificationCategory[]) {
      assert.ok(
        activeNotificationCategories().includes(c),
        `${c} has actions but carries no notification types`,
      );
    }
  });

  it('names the track action the app routes on', () => {
    // The string travels server → Expo → device → router. A typo anywhere is
    // a button that opens the inbox instead of the order.
    assert.equal(NOTIFICATION_ACTION.Track, 'track');
  });
});
