import type { ViewStyle } from 'react-native';

/**
 * The prop contract both map implementations must honour.
 *
 * `DeliveryMap.tsx` and `DeliveryMap.web.tsx` are two independent
 * implementations of the same components, and **nothing was checking that they
 * agreed**. TypeScript resolves `./DeliveryMap` to the `.tsx` file; only Metro
 * prefers `.web.tsx`. So the types the compiler checks every call site against
 * are always the native ones, and the web file could declare anything at all.
 *
 * It had already drifted: `MapPickerProps` gained a `tip` prop on native,
 * `app/address/select.tsx` started passing it, and the web version — which
 * never declared it — silently dropped the pin's label. Nothing failed.
 *
 * Declaring the contract once, here, is what makes that a compile error
 * instead. Neither implementation may re-declare these.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface DeliveryMapProps {
  /** Where the order is going — always plotted. */
  destination: LatLng;
  /** The dark store the order leaves from. */
  origin?: LatLng | null;
  /** Live rider position. Phase 2; omitted until the rider backend exists. */
  rider?: LatLng | null;
  style?: ViewStyle;
  /** Disable gestures when the map is decorative (e.g. behind a sheet). */
  interactive?: boolean;
}

export interface MapPickerProps {
  /** Where the map opens. */
  center: LatLng;
  /** Fires when panning settles, with the new centre point. */
  onCenterChange: (point: LatLng) => void;
  /** Area name for the pill above the pin; hidden until the centre resolves. */
  tip?: string;
  style?: ViewStyle;
}
