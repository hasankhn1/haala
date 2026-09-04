import bcrypt from 'bcryptjs';
import {
  UserRole,
  type AuthResult,
  type EmailAuthInput,
  type EmailAuthResult,
  type LoginInput,
  type RegisterInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { db } from '../../db/client';
import { userRepository } from '../users/user.repository';
import { authProviderRepository } from './auth-provider.repository';
import { type VerifiedIdentity, verifierFor } from './providers/verify';
import { toAuthUser } from '../users/user.service';
import { tokenService } from './token.service';

const SALT_ROUNDS = 10;
const INVALID_CREDENTIALS = 'Invalid phone or password';
/** Deliberately does not say whether the account exists. */
const INVALID_PASSWORD = 'That password doesn’t match. Try again or reset it.';

/**
 * A real bcrypt hash of a value nobody knows, compared against when an account
 * has no password. Without it, "this account has no password" returns
 * instantly while a wrong password costs ~80ms — a difference that tells an
 * attacker which accounts are Google-only.
 */
const ABSENT_PASSWORD_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

/**
 * Check a password against a hash that may not exist.
 *
 * Every read of `users.passwordHash` goes through here, because the column
 * became nullable when provider-only accounts arrived and `bcrypt.compare`
 * cannot be handed a null. Answers false for a missing hash, having spent the
 * same time as a genuine mismatch.
 */
async function verifyPassword(plain: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(plain, hash ?? ABSENT_PASSWORD_HASH);
  return hash === null ? false : ok;
}

/**
 * A stand-in display name from an email's local part: `sara.khan@x.com` →
 * `Sara Khan`. Only ever a default — the account screen can change it.
 */
/**
 * Did this fail because somebody else won a race to the same identity?
 *
 * `23505` is Postgres' unique-violation. Every creation path below looks for an
 * identity and creates one when it is missing, so two requests arriving together
 * both find nothing and the loser's insert hits a unique index —
 * `auth_providers_identity_uq`, or the users' phone or email index. That
 * surfaced as `500 Something went wrong`, which is the wrong answer twice over:
 * the account exists by then, and the customer did nothing wrong. A double-tap
 * on "Continue" over a slow connection is enough to cause it.
 */
function isUniqueViolation(e: unknown): boolean {
  // Drizzle rethrows the driver's error and node-postgres puts the SQLSTATE on
  // `code`. The wrapped `cause` is checked too: allowing for it is cheap, and a
  // missed race is a 500 in somebody's face.
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === '23505';
}

/**
 * Run a create that can race, yielding `null` if it lost instead of throwing.
 *
 * Wrapping the call rather than the transaction keeps the lost-race branch out
 * of the middle of the creation logic, where it would read as part of it.
 */
async function orNullIfRaced<T>(create: () => Promise<T>): Promise<T | null> {
  try {
    return await create();
  } catch (e) {
    if (isUniqueViolation(e)) return null;
    throw e;
  }
}

function nameFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'there';
  const words = local
    .replace(/[._-]+/g, ' ')
    .replace(/\d+/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.join(' ').slice(0, 80) || 'There';
}

export const authService = {
  /**
   * Public sign-up. The role is hard-coded to `customer` and is NOT taken from
   * the request — staff accounts come from `userService.adminCreate`.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await userRepository.findByPhone(input.phone);
    if (existing) throw AppError.conflict('An account with this phone already exists');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await orNullIfRaced(() =>
      db.transaction(async (tx) => {
      const created = await userRepository.create(
        {
          name: input.name,
          phone: input.phone,
          email: input.email ?? null,
          passwordHash,
          role: UserRole.Customer,
          // They gave us a number, so it is also the delivery contact and the
          // checkout sheet must not ask again. Migration 0010 does this for
          // everyone who signed up before; this keeps new ones consistent.
          deliveryPhone: input.phone,
        },
        tx,
      );
      // Otherwise a phone signup made after this deploy would be the only
      // account in the table without an identity row.
      await authProviderRepository.link(created.id, 'phone', input.phone, tx);
      return created;
      }),
    );
    if (!user) {
      // Lost the race described on `isUniqueViolation`. A phone signup arriving
      // twice is the same customer twice, so sign them in rather than failing —
      // with the password checked, as everywhere else.
      const now = await userRepository.findByPhone(input.phone);
      if (!now) throw AppError.internal('Could not resolve the account just created');
      if (!now.isActive) throw AppError.unauthorized('Account is no longer active');
      if (!(await verifyPassword(input.password, now.passwordHash))) {
        throw AppError.unauthorized(INVALID_CREDENTIALS);
      }
      return { user: toAuthUser(now), tokens: await tokenService.issue(now) };
    }

    const tokens = await tokenService.issue(user);
    return { user: toAuthUser(user), tokens };
  },

  /**
   * Sign in with an email address, creating the account if we have never seen
   * it. There is no separate sign-up, which is the design's whole point: an
   * unknown address is a new customer, not a dead end.
   *
   * Three cases, in order, and the order is what keeps accounts from
   * multiplying:
   *
   *   1. An email identity we have already linked → check the password.
   *   2. An account that owns this address but has never signed in with it —
   *      typically a phone signup whose email we happen to hold. The password
   *      proves ownership, so linking is safe. **Linking on the address alone
   *      would not be**, and is the mistake that lets anyone claim an account by
   *      typing its email.
   *   3. Nobody has it → create, in one transaction with its identity row.
   *
   * On enumeration, honestly: an existing address with the wrong password
   * answers 401 while an unknown one answers 201, so the response distinguishes
   * them. Every login form that reports a wrong password has that side channel;
   * what this deliberately does *not* do is offer a dedicated "does this email
   * exist" endpoint, which would turn one attempt per address into a free scan.
   * `authLimiter` caps it at 30 attempts per 15 minutes per IP.
   */
  async emailAuth(input: EmailAuthInput): Promise<EmailAuthResult> {
    const { email, password } = input;

    const linked = await authProviderRepository.findUser('email', email);
    if (linked) {
      if (!linked.isActive) throw AppError.unauthorized('Account is no longer active');
      const ok = await verifyPassword(password, linked.passwordHash);
      if (!ok) throw AppError.unauthorized(INVALID_PASSWORD);
      return { user: toAuthUser(linked), tokens: await tokenService.issue(linked), created: false };
    }

    const owner = await userRepository.findByEmail(email);
    if (owner) {
      if (!owner.isActive) throw AppError.unauthorized('Account is no longer active');
      const ok = await verifyPassword(password, owner.passwordHash);
      if (!ok) throw AppError.unauthorized(INVALID_PASSWORD);
      // Proved by password, so the identity may be attached.
      await authProviderRepository.link(owner.id, 'email', email);
      return { user: toAuthUser(owner), tokens: await tokenService.issue(owner), created: false };
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const created = await orNullIfRaced(() =>
      db.transaction(async (tx) => {
      const user = await userRepository.create(
        {
          // No name is asked for — the design is explicit that sign-up collects
          // nothing beyond an address and a password. `users.name` is NOT NULL,
          // so the local part stands in until the customer edits it.
          name: nameFromEmail(email),
          email,
          // Neither phone: not the login, and not the delivery contact either.
          // Checkout asks for that when it actually needs it.
          phone: null,
          passwordHash,
          role: UserRole.Customer,
        },
        tx,
      );
      await authProviderRepository.link(user.id, 'email', email, tx);
      return user;
      }),
    );
    if (!created) {
      // Lost the race described on `isUniqueViolation`: the identity exists
      // now, so answer as we would have a moment earlier — and the password
      // still has to match, because losing a race proves nothing.
      const now = await authProviderRepository.findUser('email', email);
      if (!now) throw AppError.internal('Could not resolve the account just created');
      if (!now.isActive) throw AppError.unauthorized('Account is no longer active');
      if (!(await verifyPassword(password, now.passwordHash))) {
        throw AppError.unauthorized(INVALID_PASSWORD);
      }
      return { user: toAuthUser(now), tokens: await tokenService.issue(now), created: false };
    }

    return { user: toAuthUser(created), tokens: await tokenService.issue(created), created: true };
  },

  /**
   * Sign in with Google or Apple.
   *
   * The token is verified before anything else happens, so `identity.subject`
   * is the provider's word rather than the client's. From there:
   *
   *   1. We have seen this `sub` → that is the customer, done.
   *   2. New `sub`, but the provider **states the email is verified** and an
   *      account already owns it → attach and sign in. This is the "I signed up
   *      with a password, now I'm using the Google button" case, and it is safe
   *      precisely because Google asserted the address.
   *   3. Otherwise → a new customer.
   *
   * Case 2 turns on `emailVerified`, and that is the whole security of it. An
   * unverified address in a provider profile is just a string the account holder
   * chose; honouring it would let anyone claim somebody else's account by
   * putting their address in a Google profile. When it is false we fall through
   * to case 3 and make a separate account, which is recoverable — wrongly
   * merging two people's accounts is not.
   *
   * Nothing here reads a password. A provider-only customer has none, which is
   * why `users.passwordHash` is nullable.
   */
  async providerAuth(provider: 'google' | 'apple', idToken: string): Promise<EmailAuthResult> {
    // Verification and resolution are deliberately two steps. The first talks
    // to Google; the second is where every decision that matters happens, and
    // keeping it separate is what makes those decisions testable without a
    // real signed token.
    return this.resolveIdentity(await verifierFor(provider)(idToken));
  },

  /**
   * Attach a **already-verified** identity to a customer, creating one if
   * needed. Never call this with anything a client supplied directly — the
   * whole point of `VerifiedIdentity` is that a provider vouched for it.
   */
  async resolveIdentity(identity: VerifiedIdentity): Promise<EmailAuthResult> {
    const known = await authProviderRepository.findUser(identity.provider, identity.subject);
    if (known) {
      if (!known.isActive) throw AppError.unauthorized('Account is no longer active');
      return { user: toAuthUser(known), tokens: await tokenService.issue(known), created: false };
    }

    if (identity.email && identity.emailVerified) {
      const owner = await userRepository.findByEmail(identity.email);
      if (owner) {
        if (!owner.isActive) throw AppError.unauthorized('Account is no longer active');
        await authProviderRepository.link(owner.id, identity.provider, identity.subject);
        return { user: toAuthUser(owner), tokens: await tokenService.issue(owner), created: false };
      }
    }

    const user = await orNullIfRaced(() =>
      db.transaction(async (tx) => {
      const created = await userRepository.create(
        {
          name: identity.name?.trim() || (identity.email ? nameFromEmail(identity.email) : 'There'),
          // Only stored when the provider vouched for it, so `users.email`
          // never holds an address nobody confirmed. Apple's relay addresses
          // and its absent-after-first-login behaviour both land here as null.
          email: identity.emailVerified ? identity.email : null,
          phone: null,
          // No password at all, rather than a placeholder to compare against.
          passwordHash: null,
          role: UserRole.Customer,
        },
        tx,
      );
      await authProviderRepository.link(created.id, identity.provider, identity.subject, tx);
      return created;
      }),
    );
    if (!user) {
      // Lost the race described on `isUniqueViolation`. Nothing to re-check
      // here: the provider already vouched for this identity, which is the
      // whole point of `VerifiedIdentity`.
      const now = await authProviderRepository.findUser(identity.provider, identity.subject);
      if (!now) throw AppError.internal('Could not resolve the account just created');
      if (!now.isActive) throw AppError.unauthorized('Account is no longer active');
      return { user: toAuthUser(now), tokens: await tokenService.issue(now), created: false };
    }

    return { user: toAuthUser(user), tokens: await tokenService.issue(user), created: true };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByPhone(input.phone);
    // Compare against a hash even when missing to reduce timing signal.
    const ok =
      user && user.isActive ? await verifyPassword(input.password, user.passwordHash) : false;
    if (!user || !ok) throw AppError.unauthorized(INVALID_CREDENTIALS);

    const tokens = await tokenService.issue(user);
    return { user: toAuthUser(user), tokens };
  },

  async refresh(refreshToken: string): Promise<AuthResult> {
    const userId = await tokenService.verifyAndConsume(refreshToken);
    const user = await userRepository.findById(userId);
    if (!user || !user.isActive) throw AppError.unauthorized('Account is no longer active');

    const tokens = await tokenService.issue(user);
    return { user: toAuthUser(user), tokens };
  },

  async logout(refreshToken: string): Promise<void> {
    await tokenService.revoke(refreshToken);
  },
};
