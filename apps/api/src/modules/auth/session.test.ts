import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../app';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';

/**
 * Staying signed in, and stopping being signed in.
 *
 * The brief asks for session tests, and the properties worth asserting are the
 * ones that are invisible when they break. A refresh token that could be
 * replayed would work perfectly in every manual test — you would only find out
 * when somebody's stolen token kept minting sessions months after they logged
 * out.
 *
 * So: rotation is single-use, logout actually revokes, and a token that is not
 * ours is refused. All three are Redis-backed rather than JWT claims, which is
 * exactly why they need exercising against a real Redis.
 */
const SUFFIX = process.env.SESSION_SUFFIX ?? String(process.pid);
const EMAIL = `session.${SUFFIX}@example.test`;
const PASSWORD = 'session-test-password';

let base = '';
let close: () => Promise<void> = async () => {};
let userId = '';

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

function expectOk(r: { status: number; json: Json }, what: string): Json {
  assert.ok(
    r.status >= 200 && r.status < 300,
    `${what} failed with ${r.status}: ${JSON.stringify(r.json)}`,
  );
  return r.json.data as Json;
}

/** A fresh session, so one test's revocation cannot affect another's. */
async function freshSession(): Promise<{ accessToken: string; refreshToken: string }> {
  const data = expectOk(
    await call('POST', '/api/v1/auth/email', { body: { email: EMAIL, password: PASSWORD } }),
    'sign in',
  );
  userId = data.user.id as string;
  return data.tokens as { accessToken: string; refreshToken: string };
}

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated throwaway database and a Redis. Set DATABASE_URL.');
  }
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
  await freshSession(); // creates the account
});

after(async () => {
  await db.execute(`delete from users where email = '${EMAIL}'` as never);
  await close();
  await closeDb();
  await closeRedis();
});

describe('a session survives a restart', () => {
  it('an access token from a previous launch still works', async () => {
    // What the app does on cold start: read the stored token and ask who it is.
    const { accessToken } = await freshSession();
    const me = expectOk(await call('GET', '/api/v1/users/me', { token: accessToken }), 'me');
    assert.equal(me.email, EMAIL);
  });

  it('a refresh exchanges for a working pair', async () => {
    const { refreshToken } = await freshSession();
    const next = expectOk(
      await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } }),
      'refresh',
    );
    assert.ok(next.tokens.accessToken);
    assert.ok(next.tokens.refreshToken);
    expectOk(
      await call('GET', '/api/v1/users/me', { token: next.tokens.accessToken }),
      'the new access token',
    );
  });
});

describe('a refresh token is single use', () => {
  it('cannot be replayed', async () => {
    // The property that matters. A replayable refresh token behaves perfectly
    // in every manual test and silently keeps a stolen session alive forever.
    const { refreshToken } = await freshSession();
    expectOk(await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } }), 'first use');

    const second = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } });
    assert.equal(second.status, 401, 'the same refresh token must not work twice');
  });

  it('rotates to a new one each time', async () => {
    const { refreshToken } = await freshSession();
    const first = expectOk(
      await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } }),
      'refresh',
    );
    assert.notEqual(
      first.tokens.refreshToken,
      refreshToken,
      'a refresh that returned the same token would not be rotation',
    );
    const second = expectOk(
      await call('POST', '/api/v1/auth/refresh', {
        body: { refreshToken: first.tokens.refreshToken },
      }),
      'refresh again',
    );
    assert.notEqual(second.tokens.refreshToken, first.tokens.refreshToken);
  });
});

describe('logging out ends the session', () => {
  it('revokes the refresh token', async () => {
    const { refreshToken } = await freshSession();
    expectOk(
      await call('POST', '/api/v1/auth/logout', { body: { refreshToken } }),
      'logout',
    );
    const after = await call('POST', '/api/v1/auth/refresh', { body: { refreshToken } });
    assert.equal(after.status, 401, 'a logged-out session must not be refreshable');
  });

  it('leaves the account and its delivery number intact', async () => {
    // The brief is explicit: logging out must not delete customer data, and in
    // particular not the delivery number they gave us.
    const session = await freshSession();
    expectOk(
      await call('PATCH', '/api/v1/users/me', {
        token: session.accessToken,
        body: { deliveryPhone: '+923005550123' },
      }),
      'save a number',
    );
    await call('POST', '/api/v1/auth/logout', { body: { refreshToken: session.refreshToken } });

    const back = expectOk(
      await call('POST', '/api/v1/auth/email', { body: { email: EMAIL, password: PASSWORD } }),
      'sign back in',
    );
    assert.equal(back.created, false, 'signing back in must not make a second account');
    assert.equal(back.user.id, userId, 'and it is the same customer');
    assert.equal(back.user.deliveryPhone, '+923005550123', 'their number is still there');
  });
});

describe('a token that is not ours is refused', () => {
  it('rejects a missing one', async () => {
    assert.equal((await call('GET', '/api/v1/users/me')).status, 401);
  });

  it('rejects a malformed one', async () => {
    assert.equal(
      (await call('GET', '/api/v1/users/me', { token: 'not.a.jwt' })).status,
      401,
    );
  });

  it('rejects one signed with the wrong secret', async () => {
    // A JWT is only trustworthy because of its signature; this is the check
    // that proves we verify rather than merely decode.
    const forged = [
      Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
      Buffer.from(
        JSON.stringify({ sub: userId, role: 'customer', exp: 9_999_999_999 }),
      ).toString('base64url'),
      'not-the-real-signature',
    ].join('.');
    assert.equal((await call('GET', '/api/v1/users/me', { token: forged })).status, 401);
  });

  it('rejects a refresh token used as an access token', async () => {
    // Different secrets, so this must fail — and it is an easy mistake for a
    // client to make.
    const { refreshToken } = await freshSession();
    assert.equal((await call('GET', '/api/v1/users/me', { token: refreshToken })).status, 401);
  });
});
