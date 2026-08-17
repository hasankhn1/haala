import jwt from 'jsonwebtoken';
import type { UserRole } from '@haala/shared';
import { config } from '../config';

export interface AccessTokenPayload {
  sub: string; // userId
  role: UserRole;
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
  return { sub: String(decoded.sub), role: decoded.role as UserRole };
};

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  const decoded = jwt.verify(token, config.jwt.refreshSecret) as jwt.JwtPayload;
  return { sub: String(decoded.sub), jti: String(decoded.jti) };
};
