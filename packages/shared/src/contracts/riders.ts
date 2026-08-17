import { z } from 'zod';
import { RiderAvailability } from '../enums';

export const updateAvailabilitySchema = z.object({
  availability: z.enum([
    RiderAvailability.Offline,
    RiderAvailability.Available,
    RiderAvailability.Busy,
  ]),
});
export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

export const riderLocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type RiderLocationInput = z.infer<typeof riderLocationSchema>;

export const updateRiderProfileSchema = z.object({
  vehicleType: z.string().min(2).max(40).optional(),
});
export type UpdateRiderProfileInput = z.infer<typeof updateRiderProfileSchema>;

export const assignRiderStoreSchema = z.object({
  /** `null` unassigns the rider, dropping them back to proximity matching. */
  storeId: z.string().uuid().nullable(),
});
export type AssignRiderStoreInput = z.infer<typeof assignRiderStoreSchema>;

export interface RiderView {
  id: string;
  userId: string;
  name: string;
  phone: string;
  availability: RiderAvailability;
  vehicleType: string | null;
  currentLat: number | null;
  currentLng: number | null;
  lastSeenAt: string | null;
  /** Lifetime completed deliveries — shown on the customer's tracking card. */
  completedDeliveries: number;
  /** Home store this rider collects from, if assigned. */
  storeId: string | null;
  storeName: string | null;
}

/**
 * How the rider's claimable pool was scoped, so the app can explain an empty
 * queue instead of just showing nothing.
 *
 * - `store` — assigned to a home store; sees only that store's orders.
 * - `proximity` — unassigned, matched to stores near their last position.
 * - `unavailable` — unassigned AND no known position, so we can't say which
 *   store they could reach. Shows nothing by design.
 */
export type PoolScope = 'store' | 'proximity' | 'unavailable';

/**
 * What the customer is allowed to see about the courier bringing their order.
 * Deliberately narrower than {@link RiderView}: no availability, no history.
 */
export interface RiderPublicView {
  name: string;
  phone: string;
  vehicleType: string | null;
  lat: number | null;
  lng: number | null;
  /** Completed deliveries, used as a lightweight trust signal. */
  trips: number;
}
