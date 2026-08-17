import type { StoreView } from '@haala/shared';
import { AppError } from '../../common/errors';
import { haversineMeters } from '../../common/geo';
import type { Store } from '../../db/schema';
import { storeRepository } from './store.repository';

const toView = (s: Store, distanceMeters?: number): StoreView => ({
  id: s.id,
  name: s.name,
  area: s.area,
  city: s.city,
  latitude: s.latitude,
  longitude: s.longitude,
  ...(distanceMeters !== undefined
    ? { distanceMeters, isServiceable: distanceMeters <= s.deliveryRadiusMeters }
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
      .map(({ store, distance }) => toView(store, distance));
  },

  async getById(id: string): Promise<StoreView> {
    const store = await storeRepository.findActiveById(id);
    if (!store) throw AppError.notFound('Store not found');
    return toView(store);
  },
};
