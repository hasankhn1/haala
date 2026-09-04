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

/**
 * Admin-only user creation — the route the ops dashboard will use.
 *
 * `brand_user` is deliberately absent: a brand login is meaningless without a
 * `brandId`, and this route has nowhere to put one. Brand logins are created by
 * `POST /admin/brands/:id/users`, where the brand is in the path. Attempting one
 * here would violate `users_brand_role_ck` at the database.
 */
export const adminCreateUserSchema = z.object({
  name: z.string().min(2).max(80),
  phone: phoneSchema,
  email: z.string().email().optional(),
  password: z.string().min(8).max(128),
  role: z.enum([UserRole.Customer, UserRole.Rider, UserRole.Admin]),
});
export type AdminCreateUserInput = z.infer<typeof adminCreateUserSchema>;

/**
 * Email sign-in, which is also email sign-up.
 *
 * One schema and one endpoint for both, because the design has no separate
 * signup screen: an address we do not recognise becomes an account. The server
 * reports which happened via `created` so the client can confirm it rather than
 * silently making one.
 *
 * The email is lower-cased and trimmed here so `Hassan@X.com` and
 * `hassan@x.com` cannot become two accounts.
 */
export const emailAuthSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(160),
    password: z.string().min(8).max(128),
  })
  .strict();
export type EmailAuthInput = z.infer<typeof emailAuthSchema>;

/**
 * Sign in with a provider. The client sends only the token it received — never
 * an email, a name or a user id, because none of those could be trusted and
 * all of them are inside the token anyway.
 */
export const providerAuthSchema = z
  .object({ idToken: z.string().min(20).max(8192) })
  .strict();
export type ProviderAuthInput = z.infer<typeof providerAuthSchema>;

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
  /**
   * Identity phone, for accounts created that way. Null for an email- or
   * Google-first signup, which is why it is no longer what checkout reads.
   */
  phone: string | null;
  email: string | null;
  /**
   * The number a rider calls. **This is what checkout checks** — present means
   * carry on, absent means open the delivery-contact sheet. Kept distinct from
   * `phone` so changing it is never a change of login.
   */
  deliveryPhone: string | null;
  role: UserRole;
  /** Set for `brand_user` and nobody else — see the `users_brand_role_ck`. */
  brandId: string | null;
}

/** An email sign-in, plus whether it made the account. */
export interface EmailAuthResult extends AuthResult {
  created: boolean;
}

export interface AuthResult {
  user: AuthUser;
  tokens: AuthTokens;
}

/**
 * One way a customer can sign in, as the client is allowed to see it.
 *
 * **`providerUserId` is deliberately not here.** In the database that column
 * holds Google's `sub` — and, for our own two providers, the customer's email
 * or phone. It is the value `authProviderRepository.findUser` matches on, which
 * is exactly why it should not travel: an identifier the linking logic trusts
 * has no business being round-tripped through a client that could then be
 * tempted to send it back. The account screen needs to know *which* methods
 * exist and when they were added, and nothing more.
 */
export interface LinkedProvider {
  provider: 'phone' | 'email' | 'google' | 'apple';
  linkedAt: string;
}
