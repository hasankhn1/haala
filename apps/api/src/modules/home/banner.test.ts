import assert from 'node:assert/strict';
import { eq } from 'drizzle-orm';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { homeBanners } from '../../db/schema';
import { closeRedis } from '../../redis/client';

/**
 * Homepage banners, and who may touch them.
 *
 * The interesting property is not the CRUD — it is that this namespace has **no
 * tenant**. Everywhere else in the platform a write is scoped to a brand and
 * `brandScope` makes forgetting that a compile error. A banner belongs to Haala
 * itself, so the only thing standing between it and a vendor is the super-admin
 * gate on the `/admin` router, and the `home/` prefix check on the object store.
 * Both are asserted below, because neither is visible in a type.
 *
 * The other property worth a test is that `PATCH` is a genuine patch. The
 * dashboard sends only the field the editor changed, so a handler that spreads
 * the body over the row would blank a banner's badge every time somebody
 * toggled it off — the kind of data loss that looks like a display bug.
 */
let base = '';
let close: () => Promise<void> = async () => {};
let adminToken = '';
let brandToken = '';
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
    // `fetch` rejects a body on GET outright, so the caller may pass one
    // uniformly across a table of verbs without special-casing each row.
    ...(opts.body === undefined || method === 'GET' || method === 'HEAD'
      ? {}
      : { body: JSON.stringify(opts.body) }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as Json };
}

async function login(phone: string): Promise<string> {
  const res = await call('POST', '/api/v1/auth/login', {
    body: { phone, password: 'haala1234' },
  });
  assert.equal(res.status, 200, `${phone} could not sign in — is the database seeded?`);
  return res.json.data.tokens.accessToken as string;
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

  adminToken = await login('+923009990000'); // Ops Admin, super_admin
  brandToken = await login('+923018818111'); // a vendor login
});

after(async () => {
  // Leave the seed as we found it — this suite runs against the dev database.
  for (const id of created) {
    await db.delete(homeBanners).where(eq(homeBanners.id, id));
  }
  await close();
  await closeDb();
  await closeRedis();
});


describe('only a super admin may edit the homepage', () => {
  it('turns a guest away', async () => {
    assert.equal((await call('GET', '/api/v1/admin/banners')).status, 401);
  });

  it('turns a vendor away from every verb', async () => {
    for (const [method, path] of [
      ['GET', '/api/v1/admin/banners'],
      ['POST', '/api/v1/admin/banners'],
      ['POST', '/api/v1/admin/banners/uploads/sign'],
    ] as const) {
      const res = await call(method, path, {
        token: brandToken,
        body: { title: 'x', contentType: 'image/jpeg' },
      });
      assert.equal(res.status, 403, `${method} ${path}`);
    }
  });

  it('will not let a vendor claim a platform asset through their own uploads', async () => {
    // The `home/` prefix has no brand in it, so a vendor's confirm can never
    // re-derive it. 404 rather than 403: see the tenancy rule in CLAUDE.md.
    const res = await call('POST', '/api/v1/uploads/confirm', {
      token: brandToken,
      body: { key: 'home/banners/00000000-0000-0000-0000-000000000000.jpg' },
    });
    assert.equal(res.status, 404);
  });
});

describe('managing a banner', () => {
  it('creates, lists, patches and deletes', async () => {
    const create = await call('POST', '/api/v1/admin/banners', {
      token: adminToken,
      body: {
        departmentKey: 'grocery',
        title: 'Test banner',
        badge: 'BADGE',
        linkTo: '/department/grocery',
        sortOrder: 99,
      },
    });
    assert.equal(create.status, 201);
    const id = create.json.data.id as string;
    created.push(id);
    assert.equal(create.json.data.isActive, true, 'a new banner is live unless said otherwise');

    const list = (await call('GET', '/api/v1/admin/banners', { token: adminToken })).json
      .data as Json[];
    assert.ok(list.some((b) => b.id === id), 'the new banner is listed');

    // The patch that used to blank things: one field in, everything else kept.
    const patched = await call('PATCH', `/api/v1/admin/banners/${id}`, {
      token: adminToken,
      body: { isActive: false },
    });
    assert.equal(patched.status, 200);
    assert.equal(patched.json.data.isActive, false);
    assert.equal(patched.json.data.badge, 'BADGE', 'an absent field is untouched, not nulled');
    assert.equal(patched.json.data.linkTo, '/department/grocery');

    // …and an explicit null still clears, because "remove the badge" has to be
    // expressible.
    const cleared = await call('PATCH', `/api/v1/admin/banners/${id}`, {
      token: adminToken,
      body: { badge: null },
    });
    assert.equal(cleared.json.data.badge, null, 'an explicit null clears');

    assert.equal(
      (await call('DELETE', `/api/v1/admin/banners/${id}`, { token: adminToken })).status,
      200,
    );
    assert.equal(
      (await call('DELETE', `/api/v1/admin/banners/${id}`, { token: adminToken })).status,
      404,
      'deleting twice is a 404, not a 500',
    );
    created.pop();
  });

  it('hides an inactive banner from the home screen', async () => {
    const id = (
      await call('POST', '/api/v1/admin/banners', {
        token: adminToken,
        body: { departmentKey: 'grocery', title: 'Hidden banner', isActive: false },
      })
    ).json.data.id as string;
    created.push(id);

    const home = (await call('GET', '/api/v1/catalog/home')).json.data as Json;
    assert.ok(
      !(home.banners as Json[]).some((b) => b.id === id),
      'switched off means gone from the app, not merely greyed in the dashboard',
    );
  });

  it('withholds a banner pointing at a department that is not live', async () => {
    // Bakery has no stock in the seed. A promo card opening onto an empty shelf
    // is worse than no promo card.
    const id = (
      await call('POST', '/api/v1/admin/banners', {
        token: adminToken,
        body: { departmentKey: 'bakery', title: 'Bakery promo' },
      })
    ).json.data.id as string;
    created.push(id);

    const home = (await call('GET', '/api/v1/catalog/home')).json.data as Json;
    const bakeryIsLive = (home.departments as Json[]).some(
      (d) => d.key === 'bakery' && d.isLive,
    );
    assert.equal(bakeryIsLive, false, 'this test assumes the seed leaves bakery empty');
    assert.ok(!(home.banners as Json[]).some((b) => b.id === id));
  });

  it('rejects a banner with no title', async () => {
    const res = await call('POST', '/api/v1/admin/banners', {
      token: adminToken,
      body: { departmentKey: 'grocery', title: '' },
    });
    assert.equal(res.status, 422);
  });
});
