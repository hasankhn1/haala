import { and, eq } from 'drizzle-orm';
import { type Executor, db } from '../../db/client';
import { type AuthProvider, type User, authProviders, users } from '../../db/schema';

/** The provider values the enum accepts. `apple` is legal before it has a button. */
export type ProviderKind = AuthProvider['provider'];

/**
 * Resolving a verified identity to the one canonical customer.
 *
 * Every read here is keyed on `(provider, providerUserId)` — the pair a unique
 * index enforces — because that is the only lookup that cannot accidentally
 * match somebody else. Looking a customer up by email would match, and would be
 * wrong: an email address is a claim, not proof.
 */
export const authProviderRepository = {
  /** The customer behind a verified provider identity, if we have seen it. */
  async findUser(
    provider: ProviderKind,
    providerUserId: string,
    ex: Executor = db,
  ): Promise<User | undefined> {
    const [row] = await ex
      .select({ user: users })
      .from(authProviders)
      .innerJoin(users, eq(users.id, authProviders.userId))
      .where(
        and(
          eq(authProviders.provider, provider),
          eq(authProviders.providerUserId, providerUserId),
        ),
      )
      .limit(1);
    return row?.user;
  },

  /**
   * Attach an identity to an existing customer.
   *
   * `onConflictDoNothing` because two sign-ins racing on a first login is a
   * normal outcome, not an error — both are attaching the same pair, and the
   * unique index already guarantees only one row exists afterwards.
   */
  async link(
    userId: string,
    provider: ProviderKind,
    providerUserId: string,
    ex: Executor = db,
  ): Promise<void> {
    await ex
      .insert(authProviders)
      .values({ userId, provider, providerUserId })
      .onConflictDoNothing();
  },

  /** Which ways in a customer has. Drives the account screen's provider list. */
  async listForUser(userId: string, ex: Executor = db): Promise<AuthProvider[]> {
    return ex.select().from(authProviders).where(eq(authProviders.userId, userId));
  },
};
