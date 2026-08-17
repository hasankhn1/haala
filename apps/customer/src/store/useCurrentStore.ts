import { useQuery } from '@tanstack/react-query';
import type { StoreView } from '@haala/shared';
import { storesApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';
import { DEFAULT_LOCATION } from '../config';

/**
 * Resolves the delivery store for the current location. For now this uses a
 * default location; a location picker can set this later. Returns the nearest
 * serviceable store (falling back to the nearest store).
 */
export function useCurrentStore() {
  const { lat, lng } = DEFAULT_LOCATION;
  const query = useQuery({
    queryKey: qk.stores(lat, lng),
    queryFn: () => storesApi.nearby(lat, lng),
    staleTime: 5 * 60_000,
  });

  const store: StoreView | null =
    query.data?.find((s) => s.isServiceable) ?? query.data?.[0] ?? null;

  return {
    store,
    storeId: store?.id ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}
