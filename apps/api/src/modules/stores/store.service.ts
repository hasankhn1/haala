import type { StoreView } from '@haala/shared';
import { AppError } from '../../common/errors';
import { haversineMeters, isWithinDeliveryRadius } from '../../common/geo';
import type { Store } from '../../db/schema';
import { storeRepository } from './store.repository';

/**
 * `from` is the point the customer is asking about. Passing it is what adds
 * `distanceMeters` and `isServiceable`; omitting it returns the plain store.
 * A single optional point rather than loose lat/lng defaults, so there is no
 * way to accidentally measure serviceability from (0, 0).
 */
const toView = (s: Store, from?: { lat: number; lng: number }): StoreView => ({
  id: s.id,
  name: s.name,
  area: s.area,
  city: s.city,
  latitude: s.latitude,
  longitude: s.longitude,
  ...(from
    ? {
        distanceMeters: haversineMeters(from.lat, from.lng, s.latitude, s.longitude),
        isServiceable: isWithinDeliveryRadius(s, from.lat, from.lng),
      }
    : {}),
});

export const storeService = {
  /**
   * Return active stores ordered by distance from the point, each flagged with
   * whether the point is inside its delivery radius. The nearest serviceable
   * store is the head of the serviceable list.
   */
  async findNearby(lat: number, lng: number): Promise<StoreView[]> {
    const stores = await storeRepository.listActive();
    return stores
      .map((s) => ({ store: s, distance: haversineMeters(lat, lng, s.latitude, s.longitude) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ store }) => toView(store, { lat, lng }));
  },

  async getById(id: string): Promise<StoreView> {
    const store = await storeRepository.findActiveById(id);
    if (!store) throw AppError.notFound('Store not found');
    return toView(store);
  },
};
