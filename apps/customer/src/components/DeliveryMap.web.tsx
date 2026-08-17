import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Text, theme } from '@haala/ui';

/**
 * Web build of the map components.
 *
 * `react-native-maps` is native-only — it imports `codegenNativeCommands`,
 * which Metro cannot resolve for web. A runtime `Platform.OS` guard doesn't
 * help, because Metro resolves every `require()` it can see **at bundle time**,
 * before any guard runs. Metro prefers `.web.tsx` over `.tsx` for the web
 * platform, so this file replaces the native module wholesale and the web
 * bundle never reaches `react-native-maps` at all.
 *
 * The API mirrors `DeliveryMap.tsx` exactly; both render a neutral panel where
 * the map would be, so tracking and address selection stay usable on web
 * (ETA, progress, driver, the address sheet and Confirm all still work).
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface DeliveryMapProps {
  destination: LatLng;
  origin?: LatLng | null;
  rider?: LatLng | null;
  style?: ViewStyle;
  interactive?: boolean;
}

export interface MapPickerProps {
  center: LatLng;
  onCenterChange: (point: LatLng) => void;
  style?: ViewStyle;
}

export function DeliveryMap({ style }: DeliveryMapProps) {
  return <MapPanel style={style} label="MAP UNAVAILABLE ON WEB" />;
}

export function MapPicker({ style }: MapPickerProps) {
  return <MapPanel style={style} label="MAP UNAVAILABLE ON WEB" />;
}

function MapPanel({ style, label }: { style?: ViewStyle; label: string }) {
  return (
    <View style={[styles.panel, style]}>
      <Text variant="labelSm" color="textTertiary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
