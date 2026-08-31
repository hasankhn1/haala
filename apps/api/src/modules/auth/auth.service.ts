import bcrypt from 'bcryptjs';
import { UserRole, type AuthResult, type LoginInput, type RegisterInput } from '@haala/shared';
import { AppError } from '../../common/errors';
import { userRepository } from '../users/user.repository';
import { toAuthUser } from '../users/user.service';
import { tokenService } from './token.service';

const SALT_ROUNDS = 10;
const INVALID_CREDENTIALS = 'Invalid phone or password';

export const authService = {
  /**
   * Public sign-up. The role is hard-coded to `customer` and is NOT taken from
   * the request — staff accounts come from `userService.adminCreate`.
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    const existing = await userRepository.findByPhone(input.phone);
    if (existing) throw AppError.conflict('An account with this phone already exists');

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
    const user = await userRepository.create({
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      passwordHash,
      role: UserRole.Customer,
    });

    const tokens = await tokenService.issue(user);
    return { user: toAuthUser(user), tokens };
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
