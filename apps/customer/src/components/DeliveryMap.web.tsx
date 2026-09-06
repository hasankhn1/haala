import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, theme } from '@haala/ui';
import { WEB_MAPS_CONFIGURED, loadGoogleMaps } from '../lib/googleMapsLoader.web';
import type { DeliveryMapProps, LatLng, MapPickerProps } from './DeliveryMap.types';

/**
 * Web build of the map components.
 *
 * `react-native-maps` is native-only — it imports `codegenNativeCommands`,
 * which Metro cannot resolve for web, and a runtime `Platform.OS` guard does
 * not help because Metro resolves every `require()` it can see **at bundle
 * time**. Metro prefers `.web.tsx`, so this file replaces the native module
 * wholesale and the web bundle never reaches `react-native-maps` at all.
 *
 * This used to be a placeholder panel. It is now a real map on the Maps
 * JavaScript API — but the panel is still here, and still matters: without a
 * browser key there is nothing to draw, and every other part of the tracking
 * and address screens works regardless.
 *
 * The contract comes from `DeliveryMap.types.ts` rather than being re-declared,
 * because the two implementations had already drifted apart once.
 */
export type { DeliveryMapProps, LatLng, MapPickerProps };

/** As `REGION_PADDING` / `PICKER_SPAN` on native, converted to a zoom level. */
const TRACKING_ZOOM = 14;
/** Street level. Placing a pin on a house needs to distinguish buildings. */
const PICKER_ZOOM = 17;

/**
 * Chrome off, and the ember-on-warm-neutral treatment the rest of the app
 * uses. Google's default map is blue-grey and fights everything around it.
 */
const MAP_OPTIONS: google.maps.MapOptions = {
  disableDefaultUI: true,
  clickableIcons: false,
  keyboardShortcuts: false,
  styles: [
    { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
    { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    { featureType: 'water', stylers: [{ color: '#DCE6E9' }] },
    { featureType: 'landscape', stylers: [{ color: '#F7F3EF' }] },
    { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#FFFFFF' }] },
    { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#FFFBF7' }] },
  ],
};

const toLatLngLiteral = (p: LatLng) => ({ lat: p.latitude, lng: p.longitude });

/**
 * The comps' teardrop, as a `data:` URI so Google draws the *same* pin the
 * native map does rather than something similar.
 *
 * Identical path and circle to `PinGlyph` in `DeliveryMap.tsx`. Colours are
 * interpolated from the tokens so a re-theme moves both together, and the `#`
 * has to be escaped for a URL.
 */
function teardropIcon(maps: typeof google.maps): google.maps.Icon {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="42" height="52" viewBox="0 0 42 52" fill="none"><path d="M21 51C21 51 38 31.9 38 19A17 17 0 1 0 4 19C4 31.9 21 51 21 51Z" fill="${theme.colors.primary}" stroke="${theme.colors.surface}" stroke-width="3"/><circle cx="21" cy="18.5" r="6.4" fill="${theme.colors.surface}"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new maps.Size(26, 32),
    // The tip points at the address, not the middle of the glyph.
    anchor: new maps.Point(13, 31),
  };
}

function dotIcon(maps: typeof google.maps, fill: string, stroke: string): google.maps.Symbol {
  return {
    path: maps.SymbolPath.CIRCLE,
    scale: 7,
    fillColor: fill,
    fillOpacity: 1,
    strokeColor: stroke,
    strokeWeight: 3,
  };
}

/**
 * Holds a `google.maps.Map` for a plain `<div>`, and reports when it is ready.
 *
 * Returns the container ref rather than taking one, so the caller cannot forget
 * to attach it. `failed` distinguishes "no key / script blocked" from "still
 * loading", which is the difference between showing the panel and showing
 * nothing.
 */
function useGoogleMap(options: google.maps.MapOptions) {
  const container = useRef<View | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [maps, setMaps] = useState<typeof google.maps | null>(null);
  const [failed, setFailed] = useState(!WEB_MAPS_CONFIGURED);
  // Read once: re-creating the map when a caller passes a fresh options object
  // would throw the viewport away on every render.
  const initial = useRef(options);

  useEffect(() => {
    if (!WEB_MAPS_CONFIGURED) return;
    let cancelled = false;

    void loadGoogleMaps()
      .then((api) => {
        if (cancelled) return;
        // `container.current` is the underlying DOM node under
        // react-native-web, which forwards View refs to the div it renders.
        const node = container.current as unknown as HTMLElement | null;
        if (!node) {
          // Was a silent `return`, which is how this managed to render neither
          // a map nor the panel: nothing failed, so nothing was said.
          if (__DEV__) {
            // eslint-disable-next-line no-console
            console.error('[DeliveryMap.web] the map container ref was never attached');
          }
          setFailed(true);
          return;
        }
        setMaps(api);
        setMap(new api.Map(node, { ...MAP_OPTIONS, ...initial.current }));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Said out loud in development. A map that silently falls back to a
        // panel is the same class of problem as one that silently draws grey:
        // the screen looks explicable and the cause is invisible.
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.error('[DeliveryMap.web] could not initialise the map:', e);
        }
        setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { container, map, maps, failed };
}

export function DeliveryMap({
  destination,
  origin,
  rider,
  style,
  interactive = false,
}: DeliveryMapProps) {
  const { container, map, maps, failed } = useGoogleMap({
    center: toLatLngLiteral(destination),
    zoom: TRACKING_ZOOM,
    gestureHandling: interactive ? 'greedy' : 'none',
  });
  const drawn = useRef<{ markers: google.maps.Marker[]; line: google.maps.Polyline | null }>({
    markers: [],
    line: null,
  });

  // Redraw whenever any point moves, and clear what was there first — Google's
  // overlays are imperative, so leaving them attached leaks a pin per update.
  useEffect(() => {
    if (!map || !maps) return;

    drawn.current.markers.forEach((m) => m.setMap(null));
    drawn.current.line?.setMap(null);
    drawn.current = { markers: [], line: null };

    const markers: google.maps.Marker[] = [
      new maps.Marker({
        map,
        position: toLatLngLiteral(destination),
        title: 'Delivery location',
        icon: teardropIcon(maps),
      }),
    ];
    if (origin) {
      markers.push(
        new maps.Marker({
          map,
          position: toLatLngLiteral(origin),
          title: 'Store',
          icon: dotIcon(maps, theme.colors.surface, theme.colors.primary),
        }),
      );
    }
    if (rider) {
      markers.push(
        new maps.Marker({
          map,
          position: toLatLngLiteral(rider),
          title: 'Rider',
          icon: dotIcon(maps, theme.colors.primary, theme.colors.surface),
        }),
      );
    }

    const line =
      rider && origin
        ? new maps.Polyline({
            map,
            path: [origin, rider, destination].map(toLatLngLiteral),
            strokeColor: theme.colors.primary,
            strokeWeight: 3,
          })
        : null;

    // Hold everything we know about in one view, as the native map's fitted
    // region does. One point would zoom to the whole world without a bound.
    const points = [destination, origin, rider].filter(Boolean) as LatLng[];
    if (points.length > 1) {
      const bounds = new maps.LatLngBounds();
      points.forEach((p) => bounds.extend(toLatLngLiteral(p)));
      map.fitBounds(bounds, 48);
    } else {
      map.setCenter(toLatLngLiteral(destination));
      map.setZoom(TRACKING_ZOOM);
    }

    drawn.current = { markers, line };
  }, [map, maps, destination, origin, rider]);

  // Clean up on unmount as well, or the overlays outlive the screen.
  useEffect(
    () => () => {
      drawn.current.markers.forEach((m) => m.setMap(null));
      drawn.current.line?.setMap(null);
    },
    [],
  );

  if (failed) return <MapPanel style={style} />;
  return <View ref={container} style={[styles.map, style]} />;
}

export function MapPicker({ center, onCenterChange, tip, style }: MapPickerProps) {
  const { container, map, failed } = useGoogleMap({
    center: toLatLngLiteral(center),
    zoom: PICKER_ZOOM,
    gestureHandling: 'greedy',
  });
  const [dragging, setDragging] = useState(false);
  /** The last point we told the parent about, so our own pan does not bounce. */
  const emitted = useRef<LatLng | null>(null);

  // Report where the pin landed. `idle` is the web equivalent of
  // `onRegionChangeComplete`: it fires once the map settles, not per frame.
  useEffect(() => {
    if (!map) return;
    const start = map.addListener('dragstart', () => setDragging(true));
    const idle = map.addListener('idle', () => {
      setDragging(false);
      const c = map.getCenter();
      if (!c) return;
      const point = { latitude: c.lat(), longitude: c.lng() };
      // `idle` also fires after our own `panTo` below, and emitting there would
      // bounce the parent's own move straight back at it.
      if (point.latitude === center.latitude && point.longitude === center.longitude) return;
      emitted.current = point;
      onCenterChange(point);
    });
    return () => {
      start.remove();
      idle.remove();
    };
  }, [map, center.latitude, center.longitude, onCenterChange]);

  // Follow the parent when *it* moves the point — the "use my location" button.
  // Without this the button silently updated the address while the map stayed
  // put, which is the same bug the native side had.
  useEffect(() => {
    if (!map) return;
    const isOurOwnPan =
      emitted.current?.latitude === center.latitude &&
      emitted.current?.longitude === center.longitude;
    if (isOurOwnPan) return;
    map.panTo(toLatLngLiteral(center));
  }, [map, center.latitude, center.longitude]);

  if (failed) return <MapPanel style={style} />;

  return (
    <View style={[styles.map, style]}>
      <View ref={container} style={StyleSheet.absoluteFill} />

      {/*
        The pin is an overlay pinned to the map's centre rather than a marker on
        it — what the comps draw ("drag the map to move the pin"), and it cannot
        be swallowed by the map's own gesture handling. `pointerEvents: none` so
        the pan reaches the map underneath.
      */}
      <View style={styles.pinLayer} pointerEvents="none">
        <View style={[styles.pinGroup, dragging && styles.pinGroupLifted]}>
          {tip ? (
            <View style={styles.pinLabel}>
              <Text variant="labelSm" color="onPrimary" numberOfLines={1}>
                {dragging ? 'Drop here' : tip}
              </Text>
            </View>
          ) : null}
          <PinGlyph lifted={dragging} />
        </View>
      </View>
    </View>
  );
}

/**
 * The same teardrop as the native `PinGlyph`, in DOM.
 *
 * Plain elements rather than `react-native-svg`: this only ever runs on web, so
 * an inline `<svg>` is one fewer layer between the markup and what the comps
 * specify.
 */
function PinGlyph({ size = 42, lifted = false }: { size?: number; lifted?: boolean }) {
  const h = (size / 42) * 52;
  return (
    <View style={styles.pinStack}>
      <svg width={size} height={h} viewBox="0 0 42 52" fill="none">
        <path
          d="M21 51C21 51 38 31.9 38 19A17 17 0 1 0 4 19C4 31.9 21 51 21 51Z"
          fill={theme.colors.primary}
          stroke={theme.colors.surface}
          strokeWidth={3}
        />
        <circle cx="21" cy="18.5" r="6.4" fill={theme.colors.surface} />
      </svg>
      <View style={[styles.pinShadow, { width: lifted ? size * 0.62 : size * 0.4 }]} />
    </View>
  );
}

/**
 * Shown when there is no browser key, or the script could not load.
 *
 * Says which of the two it is, because "map unavailable" sent somebody looking
 * at Google Cloud when the answer was one line in `.env`.
 */
function MapPanel({ style }: { style?: ViewStyle }) {
  return (
    <View style={[styles.map, styles.panel, style]}>
      <Text variant="labelSm" color="textTertiary">
        {WEB_MAPS_CONFIGURED ? 'MAP COULD NOT LOAD' : 'MAP KEY NOT SET FOR WEB'}
      </Text>
      <Text variant="caption" color="textTertiary" align="center">
        {WEB_MAPS_CONFIGURED
          ? 'Everything else on this screen still works'
          : 'Set EXPO_PUBLIC_GOOGLE_MAPS_WEB_KEY — everything else still works'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, overflow: 'hidden' },
  panel: {
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: theme.spacing.md,
  },
  pinLayer: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  /** `bottom: 50%` puts the teardrop's *tip* on the centre, not its middle. */
  pinGroup: { position: 'absolute', bottom: '50%', marginBottom: -3, alignItems: 'center' },
  pinGroupLifted: { transform: [{ translateY: -8 }] },
  pinStack: { alignItems: 'center' },
  pinShadow: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.20)',
    marginTop: -2,
  },
  pinLabel: {
    backgroundColor: theme.colors.accent,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
    maxWidth: 200,
  },
});
