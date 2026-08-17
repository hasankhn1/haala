import bcrypt from 'bcryptjs';
import type { AdminCreateUserInput, AuthUser, UserRole } from '@haala/shared';
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
  role: u.role,
});

export interface UpdateProfileInput {
  name?: string;
  email?: string | null;
}

export const userService = {
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
