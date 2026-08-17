import {
  RiderAvailability,
  UserRole,
  type RiderLocationInput,
  type RiderPublicView,
  type RiderQueueView,
  type RiderView,
  type UpdateAvailabilityInput,
  type UpdateRiderProfileInput,
} from '@haala/shared';
import { AppError } from '../../common/errors';
import { logger } from '../../common/logger';
import type { Rider, User } from '../../db/schema';
import { RealtimeEvents } from '../../realtime/events';
import { emitToOrder, emitToUser } from '../../realtime/gateway';
import { deliveryRepository, isCarryingForCustomer } from '../delivery/delivery.repository';
import { orderRepository } from '../orders/order.repository';
import { storeRepository } from '../stores/store.repository';
import { userRepository } from '../users/user.repository';
import { riderRepository } from './rider.repository';

const toView = (
  rider: Rider,
  user: User,
  completedDeliveries: number,
  store?: { id: string; name: string } | null,
): RiderView => ({
  id: rider.id,
  userId: rider.userId,
  name: user.name,
  phone: user.phone,
  availability: rider.availability,
  vehicleType: rider.vehicleType,
  currentLat: rider.currentLat,
  currentLng: rider.currentLng,
  lastSeenAt: rider.lastSeenAt?.toISOString() ?? null,
  completedDeliveries,
  storeId: rider.storeId,
  storeName: store?.name ?? null,
});

export const riderService = {
  /**
   * Resolve the rider profile for a user, creating it on first use.
   *
   * Registration only creates a `users` row with role `rider`; the profile is
   * materialised lazily here so there's no separate onboarding step to forget,
   * and so an admin promoting a user to rider doesn't need a backfill.
   */
  async ensureProfile(userId: string): Promise<{ rider: Rider; user: User }> {
    const user = await userRepository.findById(userId);
    if (!user) throw AppError.unauthorized();
    if (user.role !== UserRole.Rider) {
      throw AppError.forbidden('This account is not registered as a rider');
    }

    const existing = await riderRepository.findByUserId(userId);
    if (existing) return { rider: existing, user };

    const created = await riderRepository.create({
      userId,
      availability: RiderAvailability.Offline,
    });
    logger.info({ userId }, 'Rider profile created');
    return { rider: created, user };
  },

  /**
   * Assemble the full rider view. Every mutation returns this, so resolving the
   * delivery count and home store lives here rather than being repeated (and
   * forgotten) at each call site.
   */
  async viewFor(rider: Rider, user: User): Promise<RiderView> {
    const [completed, store] = await Promise.all([
      riderRepository.completedCount(rider.userId),
      rider.storeId ? storeRepository.findById(rider.storeId) : Promise.resolve(null),
    ]);
    return toView(rider, user, completed, store ?? null);
  },

  async getMe(userId: string): Promise<RiderView> {
    const { rider, user } = await this.ensureProfile(userId);
    return this.viewFor(rider, user);
  },

  async updateProfile(userId: string, input: UpdateRiderProfileInput): Promise<RiderView> {
    const { rider, user } = await this.ensureProfile(userId);
    const updated = (await riderRepository.update(rider.id, input)) ?? rider;
    return this.viewFor(updated, user);
  },

  /**
   * Assign (or clear) a rider's home store. Admin-only — this decides which
   * orders they're offered, so it isn't the rider's to change.
   */
  async assignStore(riderUserId: string, storeId: string | null): Promise<RiderView> {
    const { rider, user } = await this.ensureProfile(riderUserId);
    if (storeId) {
      const store = await storeRepository.findActiveById(storeId);
      if (!store) throw AppError.notFound('Store not found');
    }
    const updated = (await riderRepository.update(rider.id, { storeId })) ?? rider;
    logger.info({ riderUserId, storeId }, 'Rider store assignment changed');
    return this.viewFor(updated, user);
  },

  /** Roster for the ops dashboard: every rider with their store and state. */
  async listAll(): Promise<RiderView[]> {
    const rows = await riderRepository.listAllWithUsers();
    return Promise.all(rows.map(({ rider, user }) => this.viewFor(rider, user)));
  },

  /**
   * Go online/offline. A rider mid-delivery can't go offline — the order would
   * be stranded with nobody accountable for it.
   */
  async setAvailability(userId: string, input: UpdateAvailabilityInput): Promise<RiderView> {
    const { rider, user } = await this.ensureProfile(userId);

    if (input.availability === RiderAvailability.Offline) {
      const active = await deliveryRepository.findActiveByRider(userId);
      if (active) throw AppError.invalidState('Finish your active delivery before going offline');
    }

    const updated = (await riderRepository.setAvailability(rider.id, input.availability)) ?? rider;
    return this.viewFor(updated, user);
  },

  /**
   * Record a GPS ping and fan it out to whoever is watching the active order.
   * Callers push these on a timer, so this stays deliberately cheap: one row
   * update plus a socket emit, no history table.
   */
  async pushLocation(userId: string, input: RiderLocationInput): Promise<RiderView> {
    const { rider, user } = await this.ensureProfile(userId);
    const updated = (await riderRepository.setLocation(rider.id, input.lat, input.lng)) ?? rider;

    // Only fan out to the customer once the rider actually has the goods —
    // the same gate `publicViewForOrder` applies to the REST view. The order
    // room and the customer's user room are both customer-facing, so both are
    // withheld pre-pickup. An ops/store dashboard that legitimately needs the
    // rider's position earlier should get its own room and its own check,
    // rather than widening this one.
    const active = await deliveryRepository.findActiveByRider(userId);
    if (active && isCarryingForCustomer(active)) {
      const payload = {
        orderId: active.orderId,
        riderId: rider.id,
        lat: input.lat,
        lng: input.lng,
        at: new Date().toISOString(),
      };
      emitToOrder(active.orderId, RealtimeEvents.RiderLocationUpdated, payload);
      const order = await orderRepository.findById(active.orderId);
      if (order) emitToUser(order.userId, RealtimeEvents.RiderLocationUpdated, payload);
    }

    return this.viewFor(updated, user);
  },

  async queue(userId: string): Promise<RiderQueueView> {
    await this.ensureProfile(userId);
    // Imported lazily to keep the rider module free of a hard dependency on the
    // delivery service (which already reads rider state).
    const { deliveryService } = await import('../delivery/delivery.service');
    return deliveryService.queue(userId);
  },

  /**
   * The courier as the *customer* sees them, for the tracking screen. Location
   * is only exposed once the rider actually has the goods — before pickup it
   * says nothing useful and is needless exposure of the rider's movements.
   */
  async publicViewForOrder(orderId: string): Promise<RiderPublicView | null> {
    const assignment = await deliveryRepository.findByOrderId(orderId);
    if (!assignment) return null;

    const profile = await riderRepository.findWithUserByUserId(assignment.riderId);
    if (!profile) return null;

    const carrying = isCarryingForCustomer(assignment);
    const trips = await riderRepository.completedCount(assignment.riderId);

    return {
      name: profile.user.name,
      phone: profile.user.phone,
      vehicleType: profile.rider.vehicleType,
      lat: carrying ? profile.rider.currentLat : null,
      lng: carrying ? profile.rider.currentLng : null,
      trips,
    };
  },
};
