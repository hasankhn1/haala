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
  /** Within this store's delivery radius. */
  isServiceable?: boolean;
}
