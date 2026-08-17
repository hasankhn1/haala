import { z } from 'zod';
import { UserRole } from '../enums';

/** Pakistani mobile in E.164, e.g. +923001234567. */
export const phoneSchema = z
  .string()
  .regex(/^\+92\d{10}$/, 'Phone must be in +92XXXXXXXXXX format');

/**
 * Public self-service sign-up. **Deliberately cannot set a role** — everyone
 * who registers here is a customer.
 *
 * Riders see a pool of packed orders including customer names, phone numbers
 * and home addresses, so letting the open endpoint mint a rider would hand that
 * to anyone who asked. Staff accounts are created by an admin via
 * {@link adminCreateUserSchema}, or seeded.
 *
 * `.strict()` makes a stray `role` in the body a 422 rather than a silently
 * ignored field, so a client attempting it fails loudly.
 */
export const registerSchema = z
  .object({
    name: z.string().min(2).max(80),
    phone: phoneSchema,
    email: z.string().email().optional(),
    password: z.string().min(8).max(128),
  })
  .strict();
export type RegisterInput = z.infer<typeof registerSchema>;

/** Admin-only user creation — the route the ops dashboard will use. */
export const adminCreateUserSchema = z.object({
  name: z.string().min(2).max(80),
  phone: phoneSchema,
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  role: z.enum([UserRole.Customer, UserRole.Rider, UserRole.Admin]),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

export const loginSchema = z.object({
  phone: phoneSchema,
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});
export type RefreshInput = z.infer<typeof refreshSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // access token TTL, seconds
}

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: UserRole;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}
