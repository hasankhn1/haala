import type { StoreView } from '@haala/shared';
import { AppError } from '../../common/errors';
import { hasDrawnBoundary, haversineMeters, isWithinDeliveryArea } from '../../common/geo';
import type { Store } from '../../db/schema';
import { storeRepository } from './store.repository';

/**
 * `from` is the point the customer is asking about, with its distance already
 * measured. Passing it is what adds `distanceMeters` and `isServiceable`;
 * omitting it returns the plain store. A single optional point rather than
 * loose lat/lng defaults, so there is no way to accidentally measure
 * serviceability from (0, 0).
 */
const toView = (s: Store, from?: { lat: number; lng: number; distance: number }): StoreView => {
  const view: StoreView = {
    id: s.id,
    name: s.name,
    area: s.area,
    city: s.city,
    latitude: s.latitude,
    longitude: s.longitude,
  };
  if (!from) return view;
  const isServiceable = isWithinDeliveryArea(s, from.lat, from.lng);
  return {
    ...view,
    distanceMeters: from.distance,
    isServiceable,
    insideBoundary: isServiceable && hasDrawnBoundary(s),
  };
};

export const storeService = {
  /**
   * Return active stores ordered by distance from the point, each flagged with
   * whether the point is inside its delivery area (radius or polygon). The
   * nearest serviceable store is the head of the serviceable list.
   */
  async findNearby(lat: number, lng: number): Promise<StoreView[]> {
    const stores = await storeRepository.listActive();
    return stores
      .map((s) => ({ store: s, distance: haversineMeters(lat, lng, s.latitude, s.longitude) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ store, distance }) => toView(store, { lat, lng, distance }));
  },

  async getById(id: string): Promise<StoreView> {
    const store = await storeRepository.findActiveById(id);
    if (!store) throw AppError.notFound('Store not found');
    return toView(store);
  },
};
