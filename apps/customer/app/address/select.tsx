import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AddressLabel, CreateAddressInput } from '@haala/shared';
import { Button, Chip, Icon, IconButton, Text, theme, useToast } from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { addressesApi, storesApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { MapPicker, type LatLng } from '../../src/components/DeliveryMap';
import { DEFAULT_LOCATION } from '../../src/config';
import { haptics } from '../../src/lib/haptics';
import { useDebouncedValue } from '../../src/hooks/useDebouncedValue';

type Resolved = {
  /** Street-level line, best effort from the geocoder. */
  line1: string;
  area: string;
  city: string;
};

const LABELS: AddressLabel[] = ['home', 'work', 'other'];

/**
 * Set Delivery Location — the Onyx map picker.
 *
 * Pan the map; the centre is the address. We reverse-geocode the settled centre
 * for a human-readable line, then check serviceability against `stores/nearby`
 * before allowing confirm — outside the radius the sheet turns into the
 * "we don't deliver here yet" state rather than saving an unusable address.
 *
 * Everything degrades: if permission is denied we open on the default location,
 * and if the map module is unavailable `MapPicker` renders a panel while manual
 * entry below still works.
 */
export default function SelectAddressScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const [center, setCenter] = useState<LatLng>({
    latitude: DEFAULT_LOCATION.lat,
    longitude: DEFAULT_LOCATION.lng,
  });
  const debouncedCenter = useDebouncedValue(center, 400);

  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [resolving, setResolving] = useState(false);
  const [detail, setDetail] = useState('');
  const [label, setLabel] = useState<AddressLabel>('home');
  const [serviceable, setServiceable] = useState<boolean | null>(null);
  const [locating, setLocating] = useState(true);

  // Guards against a slow geocode for an old centre overwriting a newer one.
  const geocodeSeq = useRef(0);

  // Open on the device's location when permission allows.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        setCenter({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch {
        // Fall through to DEFAULT_LOCATION.
      } finally {
        if (!cancelled) setLocating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reverse-geocode + serviceability whenever the pin settles.
  useEffect(() => {
    const seq = ++geocodeSeq.current;
    let cancelled = false;

    (async () => {
      setResolving(true);
      const { latitude, longitude } = debouncedCenter;

      // `reverseGeocodeAsync` is native-only — on web the method can be
      // undefined and throw *synchronously*, which would escape `allSettled`.
      // Deferring the call into a promise chain turns that into a rejection.
      const [place, stores] = await Promise.allSettled([
        Promise.resolve().then(() => Location.reverseGeocodeAsync({ latitude, longitude })),
        storesApi.nearby(latitude, longitude),
      ]);

      if (cancelled || seq !== geocodeSeq.current) return;

      if (place.status === 'fulfilled' && place.value.length > 0) {
        const p = place.value[0];
        setResolved({
          line1: [p.name, p.street].filter(Boolean).join(', ') || 'Pinned location',
          area: p.district ?? p.subregion ?? p.city ?? '',
          city: p.city ?? p.region ?? '',
        });
      } else {
        setResolved({ line1: 'Pinned location', area: '', city: '' });
      }

      setServiceable(
        stores.status === 'fulfilled' ? stores.value.some((s) => s.isServiceable) : null,
      );
      setResolving(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [debouncedCenter]);

  const recenter = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        toast.show('Location permission is off', 'error');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setCenter({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
    } catch {
      toast.show('Could not get your location', 'error');
    }
  }, [toast]);

  const save = useMutation({
    mutationFn: (input: CreateAddressInput) => addressesApi.create(input),
    onSuccess: () => {
      haptics.success();
      qc.invalidateQueries({ queryKey: qk.addresses });
      toast.show('Address saved');
      router.back();
    },
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not save address', 'error'),
  });

  const confirm = () => {
    if (!resolved) return;
    save.mutate({
      label,
      line1: resolved.line1,
      ...(detail.trim() ? { line2: detail.trim() } : {}),
      // The API requires both; fall back to the label so validation passes on
      // sparse geocoder results rather than silently failing.
      area: resolved.area || resolved.city || 'Unknown area',
      city: resolved.city || resolved.area || 'Unknown city',
      latitude: debouncedCenter.latitude,
      longitude: debouncedCenter.longitude,
    });
  };

  const blocked = serviceable === false;

  return (
    <View style={styles.root}>
      <MapPicker center={center} onCenterChange={setCenter} style={styles.map} />

      {/* Floating search / back bar */}
      <SafeAreaView style={styles.topBar} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <View style={styles.searchPill}>
          <Icon name="location-outline" size={18} color={theme.colors.textSecondary} />
          <Text variant="bodySm" numberOfLines={1} style={styles.flex}>
            {resolving && !resolved
              ? 'Locating…'
              : [resolved?.area, resolved?.city].filter(Boolean).join(', ') || 'Pinned location'}
          </Text>
          {locating ? <ActivityIndicator size="small" color={theme.colors.textSecondary} /> : null}
        </View>
      </SafeAreaView>

      <Pressable style={styles.recenter} onPress={recenter} accessibilityLabel="Use my location">
        <Icon name="locate" size={20} color={theme.colors.primary} />
      </Pressable>

      {/* Bottom sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <SafeAreaView style={styles.sheet} edges={['bottom', 'left', 'right']}>
          <Text variant="h2">Set Delivery Location</Text>

          <View style={styles.addrRow}>
            <Icon name="location" size={18} color={theme.colors.primary} />
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {resolved?.area || resolved?.city || 'Pinned location'}
              </Text>
              <Text variant="bodySm" color="textSecondary" numberOfLines={2}>
                {[resolved?.line1, resolved?.city].filter(Boolean).join(', ') ||
                  `${debouncedCenter.latitude.toFixed(5)}, ${debouncedCenter.longitude.toFixed(5)}`}
              </Text>
            </View>
            {resolving ? (
              <ActivityIndicator size="small" color={theme.colors.textSecondary} />
            ) : null}
          </View>

          {blocked ? (
            <View style={styles.notice}>
              <Icon name="alert-circle-outline" size={20} color={theme.colors.error} />
              <View style={styles.flex}>
                <Text variant="bodyStrong">We don’t deliver here yet</Text>
                <Text variant="bodySm" color="textSecondary">
                  This spot is outside every store’s delivery radius. Try moving the pin closer to a
                  serviced area.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.detailField}>
                <Icon name="business-outline" size={18} color={theme.colors.textSecondary} />
                <TextInput
                  style={styles.detailInput}
                  value={detail}
                  onChangeText={setDetail}
                  placeholder="Add floor / house number (optional)"
                  placeholderTextColor={theme.colors.textTertiary}
                />
                <Icon name="pencil" size={16} color={theme.colors.textTertiary} />
              </View>

              <View style={styles.labels}>
                {LABELS.map((l) => (
                  <Chip
                    key={l}
                    label={l[0].toUpperCase() + l.slice(1)}
                    selected={label === l}
                    onPress={() => setLabel(l)}
                  />
                ))}
              </View>
            </>
          )}

          <Button
            label={blocked ? 'Move the pin to continue' : 'Confirm Location'}
            onPress={confirm}
            loading={save.isPending}
            disabled={blocked || resolving || !resolved}
          />
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  map: { ...StyleSheet.absoluteFillObject },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.sm,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    height: theme.controlHeight.md,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    ...theme.elevation.card,
  },

  recenter: {
    position: 'absolute',
    right: theme.layout.margin,
    bottom: '46%',
    width: 44,
    height: 44,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...theme.elevation.card,
  },

  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
    ...theme.elevation.sheet,
  },
  addrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md },

  detailField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    height: theme.controlHeight.lg,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: theme.spacing.lg,
  },
  detailInput: {
    flex: 1,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.bodySm,
    color: theme.colors.textPrimary,
    padding: 0,
  },
  labels: { flexDirection: 'row', gap: theme.spacing.sm },

  notice: {
    flexDirection: 'row',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.errorSoft,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.lg,
  },
});
