import { and, asc, count, eq, isNull, or } from 'drizzle-orm';
import { DeliveryStatus, type RiderAvailability } from '@haala/shared';
import { db, type Executor } from '../../db/client';
import {
  deliveryAssignments,
  riders,
  users,
  type NewRider,
  type Rider,
  type User,
} from '../../db/schema';

export interface RiderWithUser {
  rider: Rider;
  user: User;
}

export const riderRepository = {
  async findByUserId(userId: string, ex: Executor = db): Promise<Rider | undefined> {
    const [row] = await ex.select().from(riders).where(eq(riders.userId, userId)).limit(1);
    return row;
  },

  async findById(id: string, ex: Executor = db): Promise<Rider | undefined> {
    const [row] = await ex.select().from(riders).where(eq(riders.id, id)).limit(1);
    return row;
  },

  /** Rider + the user row it extends, for name/phone on views. */
  async findWithUserByUserId(
    userId: string,
    ex: Executor = db,
  ): Promise<RiderWithUser | undefined> {
    const [row] = await ex
      .select({ rider: riders, user: users })
      .from(riders)
      .innerJoin(users, eq(users.id, riders.userId))
      .where(eq(riders.userId, userId))
      .limit(1);
    return row;
  },

  /** Every rider with their user row — the ops roster. */
  /**
   * Riders who should be told a pickup just became claimable at `storeId`.
   *
   * Mirrors the scoping in `deliveryService.eligibleStores` from the other
   * direction: riders assigned to this store, plus unassigned riders (whose
   * scope is proximity, filtered by the caller). Only `available` riders — a
   * busy rider can't claim, and an offline one isn't working.
   */
  async availableForStore(storeId: string, ex: Executor = db): Promise<Rider[]> {
    return ex
      .select()
      .from(riders)
      .where(
        and(
          eq(riders.availability, 'available'),
          or(eq(riders.storeId, storeId), isNull(riders.storeId)),
        ),
      );
  },

  async listAllWithUsers(ex: Executor = db): Promise<RiderWithUser[]> {
    return ex
      .select({ rider: riders, user: users })
      .from(riders)
      .innerJoin(users, eq(users.id, riders.userId))
      .orderBy(asc(users.name));
  },

  async create(data: NewRider, ex: Executor = db): Promise<Rider> {
    const [row] = await ex.insert(riders).values(data).returning();
    return row as Rider;
  },

  async update(id: string, data: Partial<NewRider>, ex: Executor = db): Promise<Rider | undefined> {
    const [row] = await ex
      .update(riders)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(riders.id, id))
      .returning();
    return row;
  },

  async setAvailability(
    id: string,
    availability: RiderAvailability,
    ex: Executor = db,
  ): Promise<Rider | undefined> {
    return this.update(id, { availability, lastSeenAt: new Date() }, ex);
  },

  async setLocation(
    id: string,
    lat: number,
    lng: number,
    ex: Executor = db,
  ): Promise<Rider | undefined> {
    return this.update(id, { currentLat: lat, currentLng: lng, lastSeenAt: new Date() }, ex);
  },

  /** Lifetime completed deliveries — a lightweight trust signal on the customer's card. */
  async completedCount(riderUserId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(deliveryAssignments)
      .where(
        and(
          eq(deliveryAssignments.riderId, riderUserId),
          eq(deliveryAssignments.status, DeliveryStatus.Completed),
        ),
      );
    return Number(row?.n ?? 0);
  },
};
