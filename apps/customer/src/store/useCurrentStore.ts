import { useQuery } from '@tanstack/react-query';
import type { AddressView, StoreView } from '@haala/shared';
import { addressesApi, storesApi } from '../api/endpoints';
import { qk } from '../api/queryKeys';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_LOCATION } from '../config';

/**
 * Resolves which store the customer is shopping from.
 *
 * The coordinates come from the customer's **delivery address**, not from a
 * constant. That matters now that more than one store is live: resolving from
 * `DEFAULT_LOCATION` meant a Hayatabad customer browsed the DHA store's stock
 * and the DHA store's prices, and only discovered the problem at checkout.
 * Ops sets each store's coordinates and `deliveryRadiusMeters` in the
 * dashboard; this is the client honouring them.
 *
 * Priority: the default address (or the only one), then `DEFAULT_LOCATION` so a
 * brand-new account can still browse before it has saved anywhere.
 *
 * Device location is deliberately *not* consulted here. It would raise an OS
 * permission prompt on the home screen at launch, and the saved address is the
 * better signal anyway — it is where the order is actually going.
 */
export interface CurrentStore {
  store: StoreView | null;
  storeId: string | null;
  isLoading: boolean;
  error: unknown;
  /**
   * True when we know where the customer is and no store covers it. Distinct
   * from `isLoading` and from a plain error: it is a real answer, and screens
   * must show "we don't deliver here yet" rather than an empty catalogue.
   */
  outOfArea: boolean;
  /** The address the resolution came from, for "Deliver to …" copy. */
  address: AddressView | null;
}

export function useCurrentStore(): CurrentStore {
  const { status } = useAuth();
  const isAuthenticated = status === 'authenticated';

  const addresses = useQuery({
    queryKey: qk.addresses,
    queryFn: addressesApi.list,
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });

  const address: AddressView | null =
    addresses.data?.find((a) => a.isDefault) ?? addresses.data?.[0] ?? null;

  const lat = address?.latitude ?? DEFAULT_LOCATION.lat;
  const lng = address?.longitude ?? DEFAULT_LOCATION.lng;

  // Wait for addresses before asking about stores, so we don't resolve against
  // the fallback coordinates and then immediately re-resolve against the real
  // ones — that flicker would show one store's prices before another's.
  const addressesSettled = !isAuthenticated || !addresses.isLoading;

  const stores = useQuery({
    queryKey: qk.stores(lat, lng),
    queryFn: () => storesApi.nearby(lat, lng),
    enabled: addressesSettled,
    staleTime: 5 * 60_000,
  });

  // Serviceable only. The previous fallback to `data[0]` — the nearest store
  // whether or not it delivers here — is exactly what let someone shop a
  // catalogue that could never be delivered to them.
  const store: StoreView | null = stores.data?.find((s) => s.isServiceable) ?? null;

  const isLoading = (isAuthenticated && addresses.isLoading) || stores.isLoading;

  return {
    store,
    storeId: store?.id ?? null,
    isLoading,
    error: stores.error ?? addresses.error,
    outOfArea: !isLoading && !stores.error && stores.data !== undefined && store === null,
    address,
  };
}
