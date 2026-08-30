import { useEffect, useRef, useState } from 'react';
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

/**
 * Padding around the **tracking** map's fitted region, in degrees — about
 * 1.3km, which is the context needed to hold the store, the rider and the
 * destination in one view.
 */
const REGION_PADDING = 0.012;

/**
 * The **picker**'s span, in degrees — about 440m. Placing a pin on a house is a
 * street-level task, and at the tracking map's 1.3km you cannot tell one
 * building from the next.
 */
const PICKER_SPAN = 0.004;

/**
 * How long to wait for the map to say it is ready before giving up on it.
 *
 * A map that never initialises used to render a blank grey box; with
 * `loadingEnabled` it spins forever instead, which is worse — it promises
 * something is coming. The usual cause is a missing or unauthorised Google Maps
 * key, which is *always* the case in Expo Go: it ships its own key and ignores
 * `app.config.js`. Falling back to the neutral panel keeps the rest of the
 * screen useful instead of hanging on a promise the map can't keep.
 */
const MAP_READY_TIMEOUT_MS = 6_000;

/**
 * How long a custom marker is allowed to keep re-rasterising after it appears
 * or moves. `react-native-maps` draws a marker's child View to a bitmap *only
 * while `tracksViewChanges` is true* — pin it to `false` from the first render
 * and the marker never draws at all, which is exactly how these pins went
 * invisible. True forever is the other failure: that is what stalled the map.
 */
const MARKER_REDRAW_MS = 600;

/**
 * `tracksViewChanges` for a custom marker: true briefly on mount and after any
 * `key` change (a moving pin needs to redraw), false the rest of the time.
 */
function useMarkerRedraw(key: string | null): boolean {
  const [redraw, setRedraw] = useState(true);
  useEffect(() => {
    setRedraw(true);
    const t = setTimeout(() => setRedraw(false), MARKER_REDRAW_MS);
    return () => clearTimeout(t);
  }, [key]);
  return redraw;
}

function useMapReady() {
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setTimedOut(true), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);
  return { onMapReady: () => setReady(true), giveUp: timedOut && !ready };
}

export function DeliveryMap({
  destination,
  origin,
  rider,
  style,
  interactive = false,
}: DeliveryMapProps) {
  const { onMapReady, giveUp } = useMapReady();
  // The static pins still need one redraw window to appear at all; the rider's
  // reopens every time it moves.
  const pinsRedraw = useMarkerRedraw('static');
  const riderRedraw = useMarkerRedraw(
    rider ? `${rider.latitude},${rider.longitude}` : null,
  );

  if (!Maps || giveUp) return <MapFallback style={style} />;

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
      loadingEnabled
      loadingBackgroundColor={theme.colors.surfaceSunken}
      loadingIndicatorColor={theme.colors.primary}
      onMapReady={onMapReady}
    >
      {origin ? (
        <Marker
          coordinate={origin}
          title="Store"
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={pinsRedraw}
        >
          <View style={styles.storePin} />
        </Marker>
      ) : null}

      <Marker
        coordinate={destination}
        title="Delivery location"
        anchor={{ x: 0.5, y: 0.5 }}
        tracksViewChanges={pinsRedraw}
      >
        <View style={styles.destOuter}>
          <View style={styles.destInner} />
        </View>
      </Marker>

      {rider ? (
        <Marker
          coordinate={rider}
          title="Rider"
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={riderRedraw}
        >
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

type MapViewInstance = InstanceType<MapsModule['default']>;

/**
 * Address-picker map with a pin you pick up and drop.
 *
 * The pin used to be a fixed overlay at the centre of the viewport, with the
 * map sliding underneath it. Dragging the marker itself is the more direct
 * gesture — you move the thing you are aiming, not everything around it.
 *
 * `onCenterChange` keeps its meaning ("the delivery point moved") so the
 * caller's debounce, reverse-geocode and serviceability check are untouched.
 */
export function MapPicker({ center, onCenterChange, style }: MapPickerProps) {
  const { onMapReady, giveUp } = useMapReady();
  const mapRef = useRef<MapViewInstance | null>(null);
  const [pin, setPin] = useState<LatLng>(center);
  const pinRedraw = useMarkerRedraw(`${pin.latitude},${pin.longitude}`);
  /** The last point we told the parent about, so our own drag doesn't bounce back. */
  const emitted = useRef<LatLng | null>(null);

  // Follow the parent when *it* moves the point — the "use my location"
  // button. `initialRegion` is read once, so without animating here that
  // button silently updated the address while the map stayed put.
  useEffect(() => {
    const isOurOwnDrag =
      emitted.current?.latitude === center.latitude &&
      emitted.current?.longitude === center.longitude;
    if (isOurOwnDrag) return;

    setPin(center);
    mapRef.current?.animateToRegion(
      { ...center, latitudeDelta: PICKER_SPAN, longitudeDelta: PICKER_SPAN },
      350,
    );
  }, [center.latitude, center.longitude]);

  if (!Maps || giveUp) return <MapFallback style={style} />;

  const { default: MapView, Marker, PROVIDER_DEFAULT } = Maps;

  const move = (point: LatLng) => {
    setPin(point);
    emitted.current = point;
    onCenterChange(point);
  };

  return (
    <View style={[styles.map, style]}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_DEFAULT}
        initialRegion={{
          ...center,
          latitudeDelta: PICKER_SPAN,
          longitudeDelta: PICKER_SPAN,
        }}
        // Tapping the map moves the pin too: dragging is precise, tapping is
        // quick, and someone reaching for a spot across the screen wants the
        // second one.
        onPress={(e: { nativeEvent: { coordinate: LatLng } }) => move(e.nativeEvent.coordinate)}
        loadingEnabled
        loadingBackgroundColor={theme.colors.surfaceSunken}
        loadingIndicatorColor={theme.colors.primary}
        onMapReady={onMapReady}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
      >
        <Marker
          coordinate={pin}
          draggable
          onDragEnd={(e: { nativeEvent: { coordinate: LatLng } }) => move(e.nativeEvent.coordinate)}
          anchor={{ x: 0.5, y: 1 }}
          tracksViewChanges={pinRedraw}
        >
          <View style={styles.pinLayer}>
            <View style={styles.pinLabel}>
              <Text variant="labelSm" color="onPrimary">
                Delivery location
              </Text>
            </View>
            <View style={styles.pinHalo}>
              <View style={styles.pinDot} />
            </View>
          </View>
        </Marker>
      </MapView>
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
      <Text variant="caption" color="textTertiary" align="center">
        Everything else on this screen still works
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  fallback: {
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: theme.spacing.md,
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

  pinLayer: { alignItems: 'center', justifyContent: 'flex-end' },
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
