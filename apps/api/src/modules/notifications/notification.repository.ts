import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, type Executor } from '../../db/client';
import {
  notifications,
  pushTokens,
  type NewNotification,
  type Notification,
  type PushToken,
} from '../../db/schema';

export const notificationRepository = {
  async listByUser(userId: string, limit = 50, ex: Executor = db): Promise<Notification[]> {
    return ex
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  },

  async unreadCount(userId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
    return Number(row?.n ?? 0);
  },

  async create(data: NewNotification, ex: Executor = db): Promise<Notification> {
    const [row] = await ex.insert(notifications).values(data).returning();
    return row as Notification;
  },

  async markRead(id: string, userId: string, ex: Executor = db): Promise<boolean> {
    const rows = await ex
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
        ),
      )
      .returning({ id: notifications.id });
    return rows.length > 0;
  },

  async markAllRead(userId: string, ex: Executor = db): Promise<number> {
    const rows = await ex
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
      .returning({ id: notifications.id });
    return rows.length;
  },

  // ── Push tokens ──

  async tokensForUser(userId: string, ex: Executor = db): Promise<PushToken[]> {
    return ex.select().from(pushTokens).where(eq(pushTokens.userId, userId));
  },

  async tokensForUsers(userIds: string[], ex: Executor = db): Promise<PushToken[]> {
    if (userIds.length === 0) return [];
    return ex.select().from(pushTokens).where(inArray(pushTokens.userId, userIds));
  },

  /**
   * Register a device token against a user.
   *
   * Conflicts on the token, not the pair — the token identifies a handset, so
   * a second person signing in on the same phone must take ownership of it
   * rather than add a duplicate row, or the previous user keeps receiving
   * notifications on a device they no longer hold.
   */
  async upsertToken(
    userId: string,
    token: string,
    platform: string | null,
    ex: Executor = db,
  ): Promise<void> {
    await ex
      .insert(pushTokens)
      .values({ userId, token, platform })
      .onConflictDoUpdate({
        target: pushTokens.token,
        set: { userId, platform, updatedAt: new Date() },
      });
  },

  /**
   * Remove one device token belonging to `userId`.
   *
   * Scoped to the owner: without the `userId` predicate any authenticated user
   * could pass someone else's token and silence their order notifications.
   * Device handover doesn't need an unscoped delete — `upsertToken` already
   * reassigns ownership via the token unique index when a second person signs
   * in on the same handset.
   */
  async deleteToken(userId: string, token: string, ex: Executor = db): Promise<void> {
    await ex
      .delete(pushTokens)
      .where(and(eq(pushTokens.token, token), eq(pushTokens.userId, userId)));
  },

  /**
   * Bulk delete by token alone, deliberately unscoped. This is server-initiated
   * pruning of tokens Expo reported as `DeviceNotRegistered` — the authority is
   * Expo's response, not a user request, and a dead token belongs to nobody
   * worth notifying.
   */
  async deleteTokens(tokens: string[], ex: Executor = db): Promise<void> {
    if (tokens.length === 0) return;
    await ex.delete(pushTokens).where(inArray(pushTokens.token, tokens));
  },
};
