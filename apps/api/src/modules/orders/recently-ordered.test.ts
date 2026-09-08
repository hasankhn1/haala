import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { and, desc, eq, ne } from 'drizzle-orm';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { orderItems, orders, stores, users } from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * "Buy it again" — the home screen's Recommended row.
 *
 * Two properties carry this feature, and neither is about the list itself.
 *
 * **The price is the catalogue's, not the receipt's.** The obvious
 * implementation reads `order_items.unit_price`, which is what the customer
 * paid and may be months old. In the seed the Badminton Racket was bought at
 * PKR 2,200 and now sells for PKR 1,870; a card showing 2,200 and opening a
 * page showing 1,870 is a lie the shopper finds at checkout. So the ids come
 * from order history and everything else comes from the catalogue, priced for
 * the store they are standing in.
 *
 * **It is per-customer, so it is not in the cached home payload.**
 * `GET /catalog/home` is cached per *store* and shared by everyone near it.
 * Order history in there would serve one person's shopping to the next. That is
 * why this is a separate authenticated endpoint rather than another field, and
 * the 401 below is the guard on it.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let storeId = '';
let token = '';
let userId = '';

type Json = Record<string, any>;

async function get(path: string, tok?: string): Promise<{ status: number; json: Json }> {
  const res = await fetch(`${base}${path}`, {
    headers: tok ? { authorization: `Bearer ${tok}` } : {},
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
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

  const [store] = await db.select({ id: stores.id }).from(stores).limit(1);
  storeId = store!.id;

  // The seeded demo customer, who has order history. Picked by phone rather
  // than "whoever has the most orders" so a failure names a fixed account.
  const [customer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.phone, '+923001112233'))
    .limit(1);
  assert.ok(customer, 'the seed defines the demo customer +923001112233');
  userId = customer.id;

  const res = await fetch(`${base}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: '+923001112233', password: 'haala1234' }),
  });
  assert.equal(res.status, 200, 'the demo customer could not sign in — is the database seeded?');
  token = ((await res.json()) as Json).data.tokens.accessToken;
});

after(async () => {
  await close();
  await closeDb();
  await closeRedis();
});

describe('buy it again', () => {
  it('is not available to a guest', async () => {
    // Order history is the most personal thing the app holds.
    assert.equal((await get(`/api/v1/orders/recently-ordered?storeId=${storeId}`)).status, 401);
  });

  it('needs a store, because every field on the card is per-store', async () => {
    assert.equal((await get('/api/v1/orders/recently-ordered', token)).status, 400);
  });

  it('returns products the customer has actually bought, one row each', async () => {
    const res = await get(`/api/v1/orders/recently-ordered?storeId=${storeId}`, token);
    assert.equal(res.status, 200);

    const items = res.json.data.items as Json[];
    assert.ok(items.length > 0, 'the demo customer has order history');
    assert.ok(items.length <= 3, 'the comp draws three');

    const ids = items.map((p) => p.id as string);
    assert.equal(new Set(ids).size, ids.length, 'somebody who buys milk weekly sees milk once');

    const bought = await db
      .selectDistinct({ productId: orderItems.productId })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.userId, userId), ne(orders.status, 'cancelled')));
    const boughtIds = new Set(bought.map((r) => r.productId));
    for (const id of ids) {
      assert.ok(boughtIds.has(id), 'every row is something this customer ordered');
    }

    for (const p of items) {
      assert.ok(p.departmentKey, 'the card labels its department');
      assert.equal(typeof p.price, 'number');
    }

    // The row's subtitle quotes this, so a wrong number is visible copy.
    const placed = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, userId), ne(orders.status, 'cancelled')));
    assert.equal(res.json.data.orderCount, placed.length);
  });

  it('prices from the catalogue today, not from the old receipt', async () => {
    /*
     * The property the whole design exists for.
     *
     * It can only be *tested* at a store where something the customer bought is
     * currently marked down — anywhere else the receipt and the catalogue agree
     * and both implementations look identical. So the store is chosen rather
     * than taken: the first one where the two answers diverge. Running this
     * against an arbitrary store is how the first version of this test passed
     * while proving nothing.
     */
    const paid = await db
      .select({ productId: orderItems.productId, unitPrice: orderItems.unitPrice })
      .from(orderItems)
      .innerJoin(orders, eq(orders.id, orderItems.orderId))
      .where(and(eq(orders.userId, userId), ne(orders.status, 'cancelled')))
      .orderBy(desc(orders.createdAt));
    const paidFor = new Map(paid.map((r) => [r.productId, r.unitPrice]));

    const allStores = await db.select({ id: stores.id }).from(stores);
    let discriminating: { store: string; items: Json[] } | null = null;

    for (const s of allStores) {
      const items = (await get(`/api/v1/orders/recently-ordered?storeId=${s.id}`, token)).json
        .data.items as Json[];
      if (items?.some((p) => paidFor.get(p.id as string) !== p.price)) {
        discriminating = { store: s.id, items };
        break;
      }
    }

    assert.ok(
      discriminating,
      'no store prices any of this customer’s past purchases differently from what they paid, ' +
        'so this test cannot tell the two implementations apart — seed a markdown',
    );

    for (const p of discriminating.items) {
      const live = (await get(`/api/v1/catalog/products/${p.id}?storeId=${discriminating.store}`))
        .json.data as Json;
      assert.equal(p.price, live.price, `${p.name} is priced as the catalogue prices it now`);
      assert.equal(p.inStock, live.inStock);
    }
  });

  it('gives a customer with no history nothing, rather than someone else’s', async () => {
    const res = await fetch(`${base}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'No History',
        // A number outside the seed's range, so re-runs do not collide.
        phone: `+9230099${Date.now().toString().slice(-5)}`,
        password: 'haala1234',
      }),
    });
    assert.equal(res.status, 201, 'could not create a fresh customer');
    const fresh = ((await res.json()) as Json).data.tokens.accessToken as string;

    const mine = await get(`/api/v1/orders/recently-ordered?storeId=${storeId}`, fresh);
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.json.data.items, [], 'an empty history is empty, not a default list');
    assert.equal(mine.json.data.orderCount, 0);
  });
});
