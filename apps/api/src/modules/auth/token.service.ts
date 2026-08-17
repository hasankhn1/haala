import { randomUUID } from 'node:crypto';
import type { AuthTokens, UserRole } from '@haala/shared';
import { config } from '../../config';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../common/jwt';
import { AppError } from '../../common/errors';
import { redis } from '../../redis/client';

/**
 * Refresh tokens are opaque one-time credentials backed by Redis. We store a
 * key per (user, jti); consuming a token deletes its key, so a refresh token
 * can be used exactly once (rotation) and any key can be revoked server-side.
 */
const refreshKey = (userId: string, jti: string): string => `refresh:${userId}:${jti}`;

export const tokenService = {
  /** Issue a fresh access + refresh token pair and register the refresh jti. */
  async issue(userId: string, role: UserRole): Promise<AuthTokens> {
    const jti = randomUUID();
    const accessToken = signAccessToken({ sub: userId, role });
    const refreshToken = signRefreshToken({ sub: userId, jti });
    await redis.set(refreshKey(userId, jti), '1', 'EX', config.jwt.refreshTtl);
    return { accessToken, refreshToken, expiresIn: config.jwt.accessTtl };
  },

  /**
   * Validate a refresh token and atomically consume it (single-use rotation).
   * Returns the userId; throws if the token is invalid, expired, or reused.
   */
  async verifyAndConsume(refreshToken: string): Promise<string> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw AppError.unauthorized('Invalid refresh token');
    }
    const deleted = await redis.del(refreshKey(payload.sub, payload.jti));
    if (deleted === 0) throw AppError.unauthorized('Refresh token expired or already used');
    return payload.sub;
  },

  /** Best-effort revoke (logout). Idempotent — unknown tokens are ignored. */
  async revoke(refreshToken: string): Promise<void> {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await redis.del(refreshKey(payload.sub, payload.jti));
    } catch {
      /* already invalid — nothing to revoke */
    }
  },
};
