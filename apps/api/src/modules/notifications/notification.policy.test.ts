import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NotificationPreferencesView } from '@haala/shared';
import { DEFAULT_PREFERENCES, isQuietTime, shouldPush } from './notification.policy';

/**
 * Which pushes reach a phone, and when.
 *
 * Quiet hours are Pakistan time, and the server runs in UTC — the obvious bug
 * is a window that is five hours out, muting offers at 6 PM and letting them
 * through at 3 AM. Every instant below is written in UTC with its local time
 * beside it, so a failure reads as the clock the customer would have seen.
 */
const at = (utc: string): Date => new Date(`${utc}Z`);

const prefs = (over: Partial<NotificationPreferencesView> = {}): NotificationPreferencesView => ({
  ...DEFAULT_PREFERENCES,
  ...over,
  categories: { ...DEFAULT_PREFERENCES.categories, ...over.categories },
});

// 2026-09-24 is a Thursday; 2026-09-25 a Friday.
describe('quiet hours run 11 PM to 8 AM, Pakistan time', () => {
  it('starts at 11 PM', () => {
    assert.equal(isQuietTime(at('2026-09-24T17:59:00')), false, '10:59 PM');
    assert.equal(isQuietTime(at('2026-09-24T18:00:00')), true, '11:00 PM');
  });

  it('runs across midnight', () => {
    assert.equal(isQuietTime(at('2026-09-24T21:30:00')), true, '2:30 AM');
  });

  it('ends at 8 AM', () => {
    assert.equal(isQuietTime(at('2026-09-25T02:59:00')), true, '7:59 AM');
    assert.equal(isQuietTime(at('2026-09-25T03:00:00')), false, '8:00 AM');
  });

  it('includes Jummah on a Friday, and only on a Friday', () => {
    assert.equal(isQuietTime(at('2026-09-25T08:30:00')), true, 'Friday 1:30 PM');
    assert.equal(isQuietTime(at('2026-09-25T09:00:00')), false, 'Friday 2:00 PM');
    assert.equal(isQuietTime(at('2026-09-24T08:30:00')), false, 'Thursday 1:30 PM');
  });
});

describe('what reaches the phone', () => {
  const night = at('2026-09-24T21:30:00'); // 2:30 AM
  const noon = at('2026-09-24T07:00:00'); // Thursday noon

  it('never holds back an order update, even at night', () => {
    assert.equal(shouldPush('order', prefs(), night), true);
    assert.equal(shouldPush('payment', prefs(), night), true);
  });

  it('holds offers and service alerts during quiet hours', () => {
    const offersOn = prefs({ categories: { ...DEFAULT_PREFERENCES.categories, offer: true } });
    assert.equal(shouldPush('offer', offersOn, night), false);
    assert.equal(shouldPush('service', offersOn, night), false);
    assert.equal(shouldPush('offer', offersOn, noon), true);
  });

  it('lets them through at night when quiet hours are off', () => {
    const p = prefs({
      quietHours: false,
      categories: { ...DEFAULT_PREFERENCES.categories, offer: true },
    });
    assert.equal(shouldPush('offer', p, night), true);
  });

  it('keeps offers off until the customer turns them on', () => {
    assert.equal(shouldPush('offer', prefs(), noon), false);
  });

  it('respects a category the customer switched off, at any hour', () => {
    const p = prefs({ categories: { ...DEFAULT_PREFERENCES.categories, order: false } });
    assert.equal(shouldPush('order', p, noon), false);
  });
});
