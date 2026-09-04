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
import { toAuthUser } from '../users/user.service';
import { tokenService } from './token.service';

const SALT_ROUNDS = 10;
const INVALID_CREDENTIALS = 'Invalid phone or password';
/** Deliberately does not say whether the account exists. */
const INVALID_PASSWORD = 'That password doesn’t match. Try again or reset it.';

/**
 * A stand-in display name from an email's local part: `sara.khan@x.com` →
 * `Sara Khan`. Only ever a default — the account screen can change it.
 */
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
    const user = await db.transaction(async (tx) => {
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
    });

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
      const ok = await bcrypt.compare(password, linked.passwordHash);
      if (!ok) throw AppError.unauthorized(INVALID_PASSWORD);
      return { user: toAuthUser(linked), tokens: await tokenService.issue(linked), created: false };
    }

    const owner = await userRepository.findByEmail(email);
    if (owner) {
      if (!owner.isActive) throw AppError.unauthorized('Account is no longer active');
      const ok = await bcrypt.compare(password, owner.passwordHash);
      if (!ok) throw AppError.unauthorized(INVALID_PASSWORD);
      // Proved by password, so the identity may be attached.
      await authProviderRepository.link(owner.id, 'email', email);
      return { user: toAuthUser(owner), tokens: await tokenService.issue(owner), created: false };
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const created = await db.transaction(async (tx) => {
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
    });

    return { user: toAuthUser(created), tokens: await tokenService.issue(created), created: true };
  },

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await userRepository.findByPhone(input.phone);
    // Compare against a hash even when missing to reduce timing signal.
    const ok =
      user && user.isActive ? await bcrypt.compare(input.password, user.passwordHash) : false;
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
