import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { and, eq, inArray } from 'drizzle-orm';
import { PaymentMethod } from '@haala/shared';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { deliveryAssignments, notifications, orders, stores, users } from '../../db/schema';
import { closeRedis } from '../../redis/client';
import { DEFAULT_PREFERENCES } from './notification.policy';
import { notificationService } from './notification.service';

/**
 * The inbox filter and the preferences a customer sets, through the real API.
 *
 * **The code's defaults are the database's defaults.** A customer who has never
 * opened settings has no row, and the service answers with
 * `DEFAULT_PREFERENCES`; the first toggle creates a row from the column
 * defaults. If those two ever disagree, the first tap on one switch silently
 * flips another — offers turning themselves on is the expensive version.
 *
 * **A category filter matches every type in it**, including the generic types
 * rows were written with before templates existed, which are still in people's
 * inboxes.
 *
 * **"Arriving" is said once.** It is triggered by location pings, which arrive
 * every few seconds for as long as the rider is inside the radius.
 */
let base = '';
let close: () => Promise<void> = async () => {};
const created: string[] = [];

type Json = Record<string, any>;

async function call(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

let seq = 0;
async function signUp(): Promise<{ token: string; userId: string }> {
  seq += 1;
  const res = await call('POST', '/api/v1/auth/register', {
    body: {
      name: `Notify Test ${seq}`,
      /*
       * `seq` goes *before* the truncation, not after. `+9231` is five
       * characters and the timestamp eight, so `.slice(0, 13)` was cutting off
       * the very thing that made two registrations in the same millisecond
       * distinct — the second then collided on `users_phone_uq`, got a 409, and
       * failed the assertion below. Only on a fast machine, or once CI lowers
       * the bcrypt rounds.
       */
      phone: `+9231${seq}${String(Date.now()).slice(-7)}`.slice(0, 13),
      password: 'haala1234',
    },
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  created.push(res.json.data.user.id);
  return { token: res.json.data.tokens.accessToken, userId: res.json.data.user.id };
}

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated, seeded throwaway database. Set DATABASE_URL.');
  }
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
});

after(async () => {
  // Orders first: an assignment's rider is `on delete restrict`. Users then
  // cascade to their notifications and preferences.
  if (created.length > 0) {
    await db.delete(orders).where(inArray(orders.userId, created));
    await db.delete(users).where(inArray(users.id, created));
  }
  await close();
  await closeDb();
  await closeRedis();
});

describe('notification preferences', () => {
  it('needs a session', async () => {
    assert.equal((await call('GET', '/api/v1/notifications/preferences')).status, 401);
  });

  it('starts at the defaults, with offers off', async () => {
    const { token } = await signUp();
    const res = await call('GET', '/api/v1/notifications/preferences', { token });
    assert.equal(res.status, 200);
    assert.deepEqual(res.json.data, DEFAULT_PREFERENCES);
    assert.equal(res.json.data.categories.offer, false);
  });

  it('changes only what was sent — the first write agrees with the defaults', async () => {
    const { token } = await signUp();

    // No row exists yet, so this insert takes every other column's default.
    const first = await call('PATCH', '/api/v1/notifications/preferences', {
      token,
      body: { quietHours: false },
    });
    assert.equal(first.status, 200);
    assert.deepEqual(first.json.data.categories, DEFAULT_PREFERENCES.categories);
    assert.equal(first.json.data.quietHours, false);

    const second = await call('PATCH', '/api/v1/notifications/preferences', {
      token,
      body: { categories: { offer: true } },
    });
    assert.deepEqual(second.json.data, {
      categories: { ...DEFAULT_PREFERENCES.categories, offer: true },
      quietHours: false,
    });

    const read = await call('GET', '/api/v1/notifications/preferences', { token });
    assert.deepEqual(read.json.data, second.json.data, 'and it persisted');
  });

  it('rejects a category that does not exist', async () => {
    const { token } = await signUp();
    const res = await call('PATCH', '/api/v1/notifications/preferences', {
      token,
      body: { categories: { marketing: true } },
    });
    assert.equal(res.status, 422);
  });
});

describe('the inbox filter', () => {
  let token = '';

  before(async () => {
    const user = await signUp();
    token = user.token;
    await db.insert(notifications).values(
      [
        ['rider_assigned', 'Ali is your rider'],
        ['order_update', 'Your order is packed'], // pre-template row
        ['payment_received', 'Payment received · PKR 180'],
        ['promo', 'Free delivery till 11 PM'], // pre-template row
      ].map(([type, title]) => ({ userId: user.userId, type: type!, title: title!, body: '.' })),
    );
  });

  it('matches every type in the category, old rows included', async () => {
    const res = await call('GET', '/api/v1/notifications?category=order', { token });
    assert.equal(res.status, 200);
    const types = res.json.data.items.map((n: Json) => n.type).sort();
    assert.deepEqual(types, ['order_update', 'rider_assigned']);
    assert.ok(res.json.data.items.every((n: Json) => n.category === 'order'));

    const offers = await call('GET', '/api/v1/notifications?category=offer', { token });
    assert.deepEqual(
      offers.json.data.items.map((n: Json) => n.type),
      ['promo'],
    );
  });

  it('counts unread across every category, whatever the filter', async () => {
    const res = await call('GET', '/api/v1/notifications?category=payment', { token });
    assert.equal(res.json.data.items.length, 1);
    assert.equal(res.json.data.unreadCount, 4, 'the badge is not the filtered list');
  });

  it('returns everything without a filter', async () => {
    const res = await call('GET', '/api/v1/notifications', { token });
    assert.equal(res.json.data.items.length, 4);
  });

  it('rejects an unknown category rather than returning nothing', async () => {
    const res = await call('GET', '/api/v1/notifications?category=marketing', { token });
    assert.equal(res.status, 422);
  });

  it("never shows one customer another's inbox", async () => {
    const other = await signUp();
    const res = await call('GET', '/api/v1/notifications', { token: other.token });
    assert.equal(res.json.data.items.length, 0);
  });
});

describe('the arriving ping', () => {
  // Phase 5 gate, roughly; "near" is ~110 m from it, "far" ~2 km.
  const door = { latitude: 33.9793, longitude: 71.6903 };
  const near = { lat: 33.9803, lng: 71.6903 };
  const far = { lat: 33.9973, lng: 71.6903 };

  // The customer is fresh, so every arriving row they hold is this order's.
  const arrivals = () =>
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(and(eq(notifications.type, 'arriving'), eq(notifications.userId, customerId)));

  let customerId = '';
  let order: typeof orders.$inferSelect;
  let assignment: typeof deliveryAssignments.$inferSelect;

  before(async () => {
    const customer = await signUp();
    customerId = customer.userId;
    const [store] = await db.select({ id: stores.id }).from(stores).limit(1);
    [order] = await db
      .insert(orders)
      .values({
        userId: customerId,
        storeId: store!.id,
        orderNumber: `ARRIVE-${Date.now()}`,
        status: 'out_for_delivery',
        subtotal: 10_000,
        deliveryFee: 0,
        total: 10_000,
        paymentMethod: PaymentMethod.Cod,
        deliveryAddress: {
          label: 'home',
          line1: 'Fixture',
          area: 'DHA',
          city: 'Peshawar',
          ...door,
        },
      })
      .returning();
    [assignment] = await db
      .insert(deliveryAssignments)
      // The customer doubles as the rider: any user satisfies the foreign key,
      // and nothing here reads the rider's role.
      .values({ orderId: order!.id, riderId: customerId, status: 'en_route_to_customer' })
      .returning();
  });

  it('stays quiet while the rider is still far off', async () => {
    await notificationService.notifyIfArriving(order, assignment, far);
    assert.equal((await arrivals()).length, 0);
  });

  it('stays quiet once the rider has already said they are at the door', async () => {
    // "Arriving in 2 min" after "has arrived" reads as the rider leaving again.
    await notificationService.notifyIfArriving(order, { ...assignment, status: 'arrived' }, near);
    assert.equal((await arrivals()).length, 0);
  });

  it('speaks exactly once, however many pings race inside the radius', async () => {
    await Promise.all(
      Array.from({ length: 5 }, () =>
        notificationService.notifyIfArriving(order, assignment, near),
      ),
    );
    assert.equal((await arrivals()).length, 1);
  });
});
