import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, theme } from '@haala/ui';

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

/**
 * Map canvas for the tracking screen (native platforms).
 *
 * Web is served by `DeliveryMap.web.tsx` — Metro prefers the `.web` extension,
 * so the web bundle never resolves `react-native-maps`, which imports
 * native-only modules and would fail to bundle. A runtime `Platform.OS` check
 * cannot do this job: Metro resolves requires at bundle time.
 *
 * The `try/catch` still matters on native — it covers a runtime where the
 * native module isn't linked (bare Expo Go, a stale dev client), falling back
 * to a neutral Onyx panel. The tracking screen stays useful either way (ETA,
 * progress, driver, items), which is the point while the rider position it
 * exists to show isn't wired up yet.
 */
type MapsModule = typeof import('react-native-maps');

const Maps: MapsModule | null = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('react-native-maps') as MapsModule;
  } catch {
    return null;
  }
})();

/** Padding around the fitted region, in degrees. Roughly a city block. */
const REGION_PADDING = 0.012;

export function DeliveryMap({
  destination,
  origin,
  rider,
  style,
  interactive = false,
}: DeliveryMapProps) {
  if (!Maps) return <MapFallback style={style} />;

  const { default: MapView, Marker, Polyline, PROVIDER_DEFAULT } = Maps;
  const points = [destination, origin, rider].filter(Boolean) as LatLng[];

  // Centre on the midpoint of everything we know about, and zoom out enough to
  // hold the furthest pair.
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const region = {
    latitude: (Math.min(...lats) + Math.max(...lats)) / 2,
    longitude: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    latitudeDelta: Math.max(Math.max(...lats) - Math.min(...lats), 0) + REGION_PADDING,
    longitudeDelta: Math.max(Math.max(...lngs) - Math.min(...lngs), 0) + REGION_PADDING,
  };

  return (
    <MapView
      style={[styles.map, style]}
      provider={PROVIDER_DEFAULT}
      initialRegion={region}
      scrollEnabled={interactive}
      zoomEnabled={interactive}
      rotateEnabled={false}
      pitchEnabled={false}
      toolbarEnabled={false}
      showsCompass={false}
      showsMyLocationButton={false}
    >
      {origin ? (
        <Marker coordinate={origin} title="Store" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.storePin} />
        </Marker>
      ) : null}

      <Marker coordinate={destination} title="Delivery location" anchor={{ x: 0.5, y: 0.5 }}>
        <View style={styles.destOuter}>
          <View style={styles.destInner} />
        </View>
      </Marker>

      {rider ? (
        <Marker coordinate={rider} title="Rider" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={styles.riderPin} />
        </Marker>
      ) : null}

      {rider && origin ? (
        <Polyline
          coordinates={[origin, rider, destination]}
          strokeColor={theme.colors.primary}
          strokeWidth={3}
        />
      ) : null}
    </MapView>
  );
}

export interface MapPickerProps {
  /** Where the map opens. */
  center: LatLng;
  /** Fires when panning settles, with the new centre point. */
  onCenterChange: (point: LatLng) => void;
  style?: ViewStyle;
}

/**
 * Address-picker map. The pin is a fixed overlay at the centre of the viewport
 * rather than a `Marker`, so the map slides underneath it — the standard
 * "drag the map, not the pin" interaction the comp shows.
 */
export function MapPicker({ center, onCenterChange, style }: MapPickerProps) {
  if (!Maps) return <MapFallback style={style} />;

  const { default: MapView, PROVIDER_DEFAULT } = Maps;

  return (
    <View style={[styles.map, style]}>
      <MapView
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...center,
          latitudeDelta: REGION_PADDING,
          longitudeDelta: REGION_PADDING,
        }}
        onRegionChangeComplete={(r: { latitude: number; longitude: number }) =>
          onCenterChange({ latitude: r.latitude, longitude: r.longitude })
        }
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
      />

      {/* Fixed centre pin + label. `pointerEvents: none` so drags reach the map. */}
      <View style={styles.pinLayer} pointerEvents="none">
        <View style={styles.pinLabel}>
          <Text variant="labelSm" color="onPrimary">
            Delivery location
          </Text>
        </View>
        <View style={styles.pinHalo}>
          <View style={styles.pinDot} />
        </View>
      </View>
    </View>
  );
}

/** Neutral stand-in when no map provider is available. */
function MapFallback({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.map, styles.fallback, style]}>
      <Text variant="labelSm" color="textTertiary">
        MAP UNAVAILABLE
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  fallback: {
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storePin: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.surface,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  destOuter: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(15,23,42,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  riderPin: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: theme.colors.primary,
    borderWidth: 3,
    borderColor: theme.colors.surface,
  },

  pinLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pinLabel: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.xs,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 5,
    marginBottom: theme.spacing.sm,
  },
  pinHalo: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(15,23,42,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.primary,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
});
