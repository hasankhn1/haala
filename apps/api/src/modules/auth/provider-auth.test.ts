import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { closeDb, db } from '../../db/client';
import { closeRedis } from '../../redis/client';
import { userRepository } from '../users/user.repository';
import { authProviderRepository } from './auth-provider.repository';
import { authService } from './auth.service';
import type { VerifiedIdentity } from './providers/verify';

/**
 * What happens *after* a provider token is verified.
 *
 * `resolveIdentity` takes a `VerifiedIdentity` — the shape a provider has
 * already vouched for — so these tests exercise the branching that decides
 * whether somebody is an existing customer, a customer arriving a new way, or a
 * new customer entirely. That is where the security lives; parsing a JWT is a
 * library's job and cannot be tested here without real Google credentials.
 *
 * The case worth the most attention is an **unverified** email. Honouring one
 * would let anyone claim another person's account by putting their address in a
 * Google profile, so it must produce a separate account rather than a merge.
 */
const SUFFIX = process.env.PROVIDER_AUTH_SUFFIX ?? String(process.pid);
const made: string[] = [];

const identity = (over: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
  provider: 'google',
  subject: `google-sub-${randomUUID()}`,
  email: null,
  emailVerified: false,
  name: null,
  ...over,
});

before(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error('These tests need a migrated throwaway database. Set DATABASE_URL.');
  }
});

after(async () => {
  for (const id of made) {
    await db.execute(`delete from users where id = '${id}'` as never);
  }
  await closeDb();
  await closeRedis();
});

const track = (r: { user: { id: string } }) => {
  made.push(r.user.id);
  return r;
};

describe('a verified provider identity resolves to one customer', () => {
  it('creates a customer with no password and no phone', async () => {
    const r = track(
      await authService.resolveIdentity(
        identity({ email: `g1.${SUFFIX}@example.test`, emailVerified: true, name: 'Gina Ali' }),
      ),
    );
    assert.equal(r.created, true);
    assert.equal(r.user.name, 'Gina Ali', 'the provider name is used when offered');
    assert.equal(r.user.phone, null);
    assert.equal(r.user.deliveryPhone, null, 'checkout collects this, not sign-in');

    const row = await userRepository.findById(r.user.id);
    assert.equal(row?.passwordHash, null, 'a provider-only account stores no password');
  });

  it('returns the same customer the second time, not a new one', async () => {
    const sub = `google-sub-repeat-${SUFFIX}`;
    const first = track(await authService.resolveIdentity(identity({ subject: sub })));
    const second = await authService.resolveIdentity(identity({ subject: sub }));
    assert.equal(second.created, false);
    assert.equal(second.user.id, first.user.id, 'the same sub is the same person');
  });

  it('cannot be signed into with a password, and says nothing different about it', async () => {
    // A provider-only account has no hash at all. This must be a clean refusal
    // rather than a crash, and must not distinguish itself from a wrong one.
    const r = track(
      await authService.resolveIdentity(
        identity({ email: `g2.${SUFFIX}@example.test`, emailVerified: true }),
      ),
    );
    await assert.rejects(
      () => authService.emailAuth({ email: `g2.${SUFFIX}@example.test`, password: 'anything-at-all' }),
      (e: Error & { statusCode?: number }) => e.statusCode === 401,
      'no password set must read as a wrong password',
    );
    assert.ok(r.user.id);
  });
});

describe('linking to an existing account turns on the verified flag', () => {
  it('attaches to an account that owns a VERIFIED address', async () => {
    const email = `owner.verified.${SUFFIX}@example.test`;
    const existing = await userRepository.create({
      name: 'Password Person',
      phone: null,
      email,
      passwordHash: await bcrypt.hash('their-real-password', 10),
      role: 'customer',
    });
    made.push(existing.id);

    const r = await authService.resolveIdentity(
      identity({ email, emailVerified: true, subject: `google-verified-${SUFFIX}` }),
    );
    assert.equal(r.created, false, 'this person already had an account');
    assert.equal(r.user.id, existing.id, 'and it is theirs');

    const providers = await authProviderRepository.listForUser(existing.id);
    assert.deepEqual(
      providers.map((p) => p.provider).sort(),
      ['google'],
      'the google identity is now attached',
    );
  });

  it('leaves their password working after the link', async () => {
    const email = `owner.stillworks.${SUFFIX}@example.test`;
    const existing = await userRepository.create({
      name: 'Password Person',
      phone: null,
      email,
      passwordHash: await bcrypt.hash('their-real-password', 10),
      role: 'customer',
    });
    made.push(existing.id);

    await authService.resolveIdentity(
      identity({ email, emailVerified: true, subject: `google-stillworks-${SUFFIX}` }),
    );
    const byPassword = await authService.emailAuth({ email, password: 'their-real-password' });
    assert.equal(byPassword.user.id, existing.id, 'linking must not cost them their password');
  });

  it('REFUSES to attach on an unverified address, making a separate account', async () => {
    // The attack this prevents: put somebody else's address in a provider
    // profile, sign in, and be handed their account. A separate account is
    // recoverable; a wrongly merged one is not.
    const email = `victim.${SUFFIX}@example.test`;
    const victim = await userRepository.create({
      name: 'Victim',
      phone: null,
      email,
      passwordHash: await bcrypt.hash('victims-password', 10),
      role: 'customer',
    });
    made.push(victim.id);

    const r = track(
      await authService.resolveIdentity(
        identity({ email, emailVerified: false, subject: `google-unverified-${SUFFIX}` }),
      ),
    );
    assert.equal(r.created, true, 'an unverified address must not merge');
    assert.notEqual(r.user.id, victim.id, 'it must not be the victim’s account');
    assert.equal(r.user.email, null, 'and the unconfirmed address is not stored');
  });
});

describe('Apple is accepted by the model before it has a button', () => {
  it('resolves an apple identity through the same path', async () => {
    const r = track(
      await authService.resolveIdentity(
        identity({ provider: 'apple', subject: `apple-sub-${SUFFIX}` }),
      ),
    );
    assert.equal(r.created, true);
    const providers = await authProviderRepository.listForUser(r.user.id);
    assert.deepEqual(providers.map((p) => p.provider), ['apple']);
  });

  it('handles an identity with no email at all, as Apple sends after first login', async () => {
    const r = track(
      await authService.resolveIdentity(
        identity({ provider: 'apple', subject: `apple-noemail-${SUFFIX}`, email: null }),
      ),
    );
    assert.equal(r.created, true, 'no email must not prevent an account');
    assert.equal(r.user.email, null);
    assert.ok(r.tokens.accessToken, 'and they are signed in');
  });
});
