import bcrypt from 'bcryptjs';
import type { AdminCreateUserInput, AuthUser, LinkedProvider, UserRole } from '@haala/shared';
import { authProviderRepository } from '../auth/auth-provider.repository';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import type { User } from '../../db/schema';
import { userRepository } from './user.repository';

const SALT_ROUNDS = 10;

/** Map a DB user row to the safe, client-facing shape (no passwordHash). */
export const toAuthUser = (u: User): AuthUser => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  email: u.email,
  deliveryPhone: u.deliveryPhone,
  role: u.role,
  brandId: u.brandId,
});

/**
 * A linked identity, stripped to what a client may see.
 *
 * The mapping is the point: `providerUserId` is dropped here, once, rather than
 * relying on every future caller to remember. It holds Google's `sub` and our
 * own providers' email or phone, and it is what identity resolution matches on
 * — so it stays server-side. See `LinkedProvider`.
 */
const toLinkedProvider = (row: { provider: LinkedProvider['provider']; createdAt: Date }): LinkedProvider => ({
  provider: row.provider,
  linkedAt: row.createdAt.toISOString(),
});

export interface UpdateProfileInput {
  name?: string;
  email?: string | null;
  /** The delivery contact. Validated by `phoneSchema` at the route. */
  deliveryPhone?: string | null;
}

export const userService = {
  /**
   * Which ways in this customer has. Drives the account screen's list, and the
   * design's promise that every method points at one customer.
   */
  async listProviders(userId: string): Promise<LinkedProvider[]> {
    const rows = await authProviderRepository.listForUser(userId);
    return rows
      .map(toLinkedProvider)
      // Oldest first, so the list reads as the order they were added.
      .sort((a, b) => a.linkedAt.localeCompare(b.linkedAt));
  },

  async getById(id: string): Promise<User> {
    const user = await userRepository.findById(id);
    if (!user) throw AppError.notFound('User not found');
    return user;
  },

  async getProfile(id: string): Promise<AuthUser> {
    return toAuthUser(await this.getById(id));
  },

  async updateProfile(id: string, input: UpdateProfileInput): Promise<AuthUser> {
    const updated = await userRepository.update(id, input);
    if (!updated) throw AppError.notFound('User not found');
    return toAuthUser(updated);
  },

  /**
   * Create a staff account (rider/admin) or a customer on someone's behalf.
   *
   * This is the **only** way to mint a non-customer account through the API —
   * public `/auth/register` always produces a customer. Guarded by
   * `authorize(Admin)` on the route; the ops dashboard will call this.
   *
   * No tokens are issued: an admin creating a rider shouldn't receive that
   * rider's session. The rider signs in themselves with these credentials.
   */
  async adminCreate(input: AdminCreateUserInput): Promise<AuthUser> {
    const existing = await userRepository.findByPhone(input.phone);
    if (existing) throw AppError.conflict('An account with this phone already exists');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await userRepository.create({
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      passwordHash,
      role: input.role,
    });
    logger.info({ userId: user.id, role: user.role }, 'Staff account created by admin');
    return toAuthUser(user);
  },

  /** List accounts by role — the dashboard's rider roster. */
  async listByRole(role: UserRole): Promise<AuthUser[]> {
    const rows = await userRepository.listByRole(role);
    return rows.map(toAuthUser);
  },
};
