import { z } from 'zod';

export const nearbyStoresQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});
export type NearbyStoresQuery = z.infer<typeof nearbyStoresQuerySchema>;

export interface StoreView {
  id: string;
  name: string;
  area: string;
  city: string;
  latitude: number;
  longitude: number;
  /** Distance from the queried point, when a location was provided. */
  distanceMeters?: number;
  /** Inside this store's delivery area: its drawn polygon if it has one, else its radius. */
  isServiceable?: boolean;
  /**
   * Inside a drawn delivery boundary, not merely a radius. Only then is the
   * store's `area` a truthful label for an address at the point.
   */
  insideBoundary?: boolean;
}
