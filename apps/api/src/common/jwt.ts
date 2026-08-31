import jwt from 'jsonwebtoken';
import type { UserRole } from '@haala/shared';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string; // userId
  role: UserRole;
  /**
   * The brand this token acts for. Present only for `brand_user`.
   *
   * Carried in the token rather than looked up per request because it is
   * identity, not state — a user's brand does not change under them. Brand
   * *status* deliberately is not in here: it changes, and anything gated on it
   * reads the row.
   */
  brandId?: string;
}

export interface RefreshTokenPayload {
  sub: string; // userId
  jti: string; // token id, used for rotation/revocation in Redis
}

export const signAccessToken = (payload: AccessTokenPayload): string =>
  jwt.sign(payload, config.jwt.accessSecret, { expiresIn: config.jwt.accessTtl });

export const signRefreshToken = (payload: RefreshTokenPayload): string =>
  jwt.sign(payload, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshTtl });

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, config.jwt.accessSecret) as jwt.JwtPayload;
  return {
    sub: String(decoded.sub),
    role: decoded.role as UserRole,
    ...(decoded.brandId ? { brandId: String(decoded.brandId) } : {}),
  };
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as jwt.JwtPayload;
  return { sub: String(decoded.sub), jti: String(decoded.jti) };
};
