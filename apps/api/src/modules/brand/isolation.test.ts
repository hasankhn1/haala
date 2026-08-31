import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * Tenant isolation, tested rather than argued.
 *
 * Everything else about multi-tenancy is verifiable by reading: the `WHERE`
 * clauses are there, the middleware is wired, the constraint exists. None of
 * that distinguishes a system that isolates tenants from one that does not,
 * because **typecheck and a successful build pass either way**. Only these
 * assertions do.
 *
 * The shape is a matrix: two brands with identical-looking catalogues, and for
 * every route, brand A pointed at brand B's ids. The expected answer is always
 * 404 — never 403, which would confirm the row exists and let a competitor's
 * catalogue be enumerated by id.
 *
 * Requires a real database, because the isolation being tested lives partly in
 * SQL. Point `DATABASE_URL` at a migrated throwaway and run
 * `pnpm --filter @haala/api test`. It creates its own fixtures under a unique
 * suffix and removes them afterwards, so it is safe to re-run, but it is not
 * safe against production and refuses to guess.
 */

const SUFFIX = process.env.ISOLATION_SUFFIX ?? String(process.pid);
const PASSWORD = 'isolation-test-pw';

/**
 * `+92` followed by exactly ten digits, per `phoneSchema`. Derived from the pid
 * so two concurrent runs do not collide on the unique phone index.
 */
const phoneFor = (lead: string): string =>
  `+923${lead}${SUFFIX.replace(/\D/g, '').padStart(8, '0').slice(-8)}`;

let base = '';
let close: () => Promise<void> = async () => {};

interface Actor {
  token: string;
  brandId: string;
  categoryId: string;
  productId: string;
  variantId: string;
}
let A: Actor;
let B: Actor;
let superToken = '';

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
  const json = (await res.json().catch(() => ({}))) as Json;
  return { status: res.status, json };
}

/** Fail loudly with the server's message rather than a bare status mismatch. */
function expectOk(r: { status: number; json: Json }, what: string): Json {
  assert.ok(
    r.status >= 200 && r.status < 300,
    `${what} failed with ${r.status}: ${JSON.stringify(r.json)}`,
  );
  return r.json.data as Json;
}

async function makeBrand(name: string, phone: string): Promise<Actor> {
  const brand = expectOk(
    await call('POST', '/api/v1/admin/brands', {
      token: superToken,
      body: { name, businessTypeKey: 'bakery' },
    }),
    `create brand ${name}`,
  );

  expectOk(
    await call('POST', `/api/v1/admin/brands/${brand.id}/users`, {
      token: superToken,
      body: { name: `${name} owner`, phone, password: PASSWORD },
    }),
    `create login for ${name}`,
  );

  const login = expectOk(
    await call('POST', '/api/v1/auth/login', { body: { phone, password: PASSWORD } }),
    `login as ${name}`,
  );
  const token = login.tokens.accessToken as string;

  const category = expectOk(
    await call('POST', '/api/v1/brand/categories', { token, body: { name: 'Cakes' } }),
    `category for ${name}`,
  );
  const product = expectOk(
    await call('POST', '/api/v1/brand/products', {
      token,
      body: { categoryId: category.id, name: 'Chocolate Fudge', unit: '1 kg', basePrice: 250_000 },
    }),
    `product for ${name}`,
  );

  return {
    token,
    brandId: brand.id as string,
    categoryId: category.id as string,
    productId: product.id as string,
    variantId: product.variants[0].id as string,
  };
}

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'These tests need a migrated throwaway database. Set DATABASE_URL and re-run.',
    );
  }

  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  const login = await call('POST', '/api/v1/auth/login', {
    body: { phone: '+923009990000', password: 'haala1234' },
  });
  superToken = expectOk(login, 'super admin login').tokens.accessToken as string;

  A = await makeBrand(`Isolation A ${SUFFIX}`, phoneFor('0'));
  B = await makeBrand(`Isolation B ${SUFFIX}`, phoneFor('1'));
});

after(async () => {
  // Products and categories cascade from the brand; the logins do not, and the
  // FK is ON DELETE RESTRICT, so users go first.
  for (const actor of [A, B]) {
    if (!actor) continue;
    await db.execute(`delete from users where brand_id = '${actor.brandId}'` as never);
    await db.execute(`delete from brands where id = '${actor.brandId}'` as never);
  }
  await close();
  await closeDb();
  await closeRedis();
});

describe('a brand cannot read another brand', () => {
  it('does not list the other brand’s categories', async () => {
    const r = await call('GET', '/api/v1/brand/categories', { token: A.token });
    const ids = (expectOk(r, 'list categories') as unknown as Json[]).map((c) => c.id);
    assert.ok(ids.includes(A.categoryId), 'own category missing from its own listing');
    assert.ok(!ids.includes(B.categoryId), 'another brand’s category appeared in the listing');
  });

  it('does not list the other brand’s products', async () => {
    const r = await call('GET', '/api/v1/brand/products', { token: A.token });
    const ids = (expectOk(r, 'list products') as unknown as Json[]).map((p) => p.id);
    assert.ok(ids.includes(A.productId));
    assert.ok(!ids.includes(B.productId), 'another brand’s product appeared in the listing');
  });

  it('returns 404 — not 403 — for the other brand’s product by id', async () => {
    const r = await call('GET', `/api/v1/brand/products/${B.productId}`, { token: A.token });
    assert.equal(r.status, 404, 'a 403 here would confirm the product exists');
  });
});

describe('a brand cannot write to another brand', () => {
  it('cannot rename the other brand’s product', async () => {
    const r = await call('PATCH', `/api/v1/brand/products/${B.productId}`, {
      token: A.token,
      body: { name: 'Owned' },
    });
    assert.equal(r.status, 404);

    // And the row is genuinely untouched, not merely reported as missing.
    const after = expectOk(
      await call('GET', `/api/v1/brand/products/${B.productId}`, { token: B.token }),
      'read B’s product back',
    );
    assert.equal(after.name, 'Chocolate Fudge');
  });

  it('cannot delete the other brand’s product or category', async () => {
    assert.equal(
      (await call('DELETE', `/api/v1/brand/products/${B.productId}`, { token: A.token })).status,
      404,
    );
    assert.equal(
      (await call('DELETE', `/api/v1/brand/categories/${B.categoryId}`, { token: A.token })).status,
      404,
    );
    // Both survive.
    expectOk(
      await call('GET', `/api/v1/brand/products/${B.productId}`, { token: B.token }),
      'B’s product still there',
    );
  });

  it('cannot file its product into the other brand’s category', async () => {
    const r = await call('POST', '/api/v1/brand/products', {
      token: A.token,
      body: {
        categoryId: B.categoryId,
        name: 'Trespasser',
        unit: '1 pc',
        basePrice: 1000,
      },
    });
    assert.equal(r.status, 404, 'a foreign categoryId must not resolve');
  });

  it('cannot reorder using the other brand’s category ids', async () => {
    const r = await call('PATCH', '/api/v1/brand/categories/reorder', {
      token: A.token,
      body: { ids: [A.categoryId, B.categoryId] },
    });
    assert.equal(r.status, 404, 'a partially-applied reorder must not report success');
  });

  it('cannot touch a variant hanging off the other brand’s product', async () => {
    assert.equal(
      (
        await call('PATCH', `/api/v1/brand/products/${B.productId}/variants/${B.variantId}`, {
          token: A.token,
          body: { basePrice: 1 },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await call('POST', `/api/v1/brand/products/${B.productId}/variants`, {
          token: A.token,
          body: { label: 'XL', unit: '2 kg', basePrice: 500_000 },
        })
      ).status,
      404,
    );
  });
});

describe('the tenant comes from the token, not the request', () => {
  it('ignores a brandId smuggled into the body', async () => {
    // `.strict()` should reject it outright rather than quietly dropping it —
    // either way it must not land on B.
    const r = await call('POST', '/api/v1/brand/products', {
      token: A.token,
      body: {
        brandId: B.brandId,
        categoryId: A.categoryId,
        name: 'Body Override',
        unit: '1 pc',
        basePrice: 1000,
      },
    });
    assert.equal(r.status, 422, 'an unexpected brandId in the body must be rejected');

    const bProducts = expectOk(
      await call('GET', '/api/v1/brand/products', { token: B.token }),
      'B’s products',
    ) as unknown as Json[];
    assert.ok(!bProducts.some((p) => p.name === 'Body Override'));
  });

  it('ignores ?brandId= from a brand user', async () => {
    // Staff may name a brand this way; a brand user must not be able to.
    const r = await call('GET', `/api/v1/brand/products?brandId=${B.brandId}`, { token: A.token });
    const ids = (expectOk(r, 'scoped list') as unknown as Json[]).map((p) => p.id);
    assert.ok(ids.includes(A.productId), 'should still be A’s own catalogue');
    assert.ok(!ids.includes(B.productId), 'query parameter overrode the token');
  });
});

describe('role boundaries', () => {
  it('refuses a brand user at every platform-admin route', async () => {
    for (const path of ['/api/v1/admin/brands', '/api/v1/admin/business-types']) {
      assert.equal((await call('GET', path, { token: A.token })).status, 403, path);
    }
    assert.equal(
      (
        await call('POST', '/api/v1/admin/brands', {
          token: A.token,
          body: { name: 'Self Promoted', businessTypeKey: 'bakery' },
        })
      ).status,
      403,
    );
  });

  it('refuses ops routes to a brand user', async () => {
    assert.equal((await call('GET', '/api/v1/ops/orders', { token: A.token })).status, 403);
  });

  it('requires a brand to be named when staff use the brand routes', async () => {
    const r = await call('GET', '/api/v1/brand/products', { token: superToken });
    assert.equal(r.status, 400, 'staff acting on "some brand" must say which');
  });

  it('lets staff act on a named brand', async () => {
    const r = await call('GET', `/api/v1/brand/products?brandId=${B.brandId}`, {
      token: superToken,
    });
    const ids = (expectOk(r, 'staff view of B') as unknown as Json[]).map((p) => p.id);
    assert.ok(ids.includes(B.productId));
  });

  it('rejects an unauthenticated request', async () => {
    assert.equal((await call('GET', '/api/v1/brand/products')).status, 401);
  });
});

describe('the brand owns its catalogue, not its stock', () => {
  it('reports stock read-only and refuses to let a brand set it', async () => {
    const p = expectOk(
      await call('GET', `/api/v1/brand/products/${A.productId}`, { token: A.token }),
      'own product',
    );
    assert.equal(typeof p.stockOnHand, 'number');

    const r = await call('PATCH', `/api/v1/brand/products/${A.productId}`, {
      token: A.token,
      body: { stockOnHand: 999 },
    });
    assert.equal(r.status, 422, 'stock is the warehouse’s count, not the vendor’s');
  });

  it('validates attributes against the brand’s own business type', async () => {
    // `shelfLifeDays` belongs to bakery; `material` belongs to clothing.
    expectOk(
      await call('PATCH', `/api/v1/brand/products/${A.productId}`, {
        token: A.token,
        body: { attributes: { shelfLifeDays: 3 } },
      }),
      'a bakery attribute',
    );
    const wrong = await call('PATCH', `/api/v1/brand/products/${A.productId}`, {
      token: A.token,
      body: { attributes: { material: 'cotton' } },
    });
    assert.equal(wrong.status, 400, 'a clothing attribute on a bakery product');
  });
});
