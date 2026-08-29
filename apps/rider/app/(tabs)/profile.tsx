import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RiderAvailability } from '@haala/shared';
import { Button, Icon, StateView, Text, theme, useToast } from '@haala/ui';
import { ApiError } from '../../src/api/client';
import { riderApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';
import { useAuth } from '../../src/auth/AuthContext';

const VEHICLES = ['Motorcycle', 'Bicycle', 'Car'];

export default function ProfileScreen() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { logout } = useAuth();

  const rider = useQuery({ queryKey: qk.rider, queryFn: riderApi.me });

  const setVehicle = useMutation({
    mutationFn: (vehicleType: string) => riderApi.updateProfile({ vehicleType }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rider }),
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not update profile', 'error'),
  });

  const goOffline = useMutation({
    mutationFn: () => riderApi.setAvailability({ availability: RiderAvailability.Offline }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rider }),
    onError: (e) => toast.show(e instanceof ApiError ? e.message : 'Could not go offline', 'error'),
  });

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text variant="h1">Profile</Text>
      </View>

      <StateView loading={rider.isLoading} error={rider.error} onRetry={() => rider.refetch()}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Icon name="person" size={26} color={theme.colors.onPrimary} />
            </View>
            <View style={styles.flex}>
              <Text variant="h3">{rider.data?.name}</Text>
              <Text variant="bodySm" color="textSecondary">
                {rider.data?.phone}
              </Text>
            </View>
          </View>

          <View style={styles.stats}>
            <Stat value={String(rider.data?.completedDeliveries ?? 0)} label="Deliveries" />
            <Stat
              value={rider.data?.availability === RiderAvailability.Offline ? 'Off' : 'On'}
              label="Shift"
            />
            <Stat value={rider.data?.vehicleType ?? '—'} label="Vehicle" />
          </View>

          <View style={styles.block}>
            <Text variant="labelCaps" color="textSecondary">
              Vehicle
            </Text>
            <View style={styles.vehicles}>
              {VEHICLES.map((v) => {
                const active = rider.data?.vehicleType === v;
                return (
                  <Button
                    key={v}
                    label={v}
                    variant={active ? 'primary' : 'secondary'}
                    size="sm"
                    fullWidth={false}
                    onPress={() => setVehicle.mutate(v)}
                    loading={setVehicle.isPending && setVehicle.variables === v}
                  />
                );
              })}
            </View>
          </View>

          <View style={styles.block}>
            {rider.data?.availability !== RiderAvailability.Offline ? (
              <Button
                label="End shift (go offline)"
                variant="secondary"
                onPress={() => goOffline.mutate()}
                loading={goOffline.isPending}
              />
            ) : null}
            <Button label="Sign out" variant="danger" onPress={onLogout} />
          </View>
        </ScrollView>
      </StateView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="h2" numberOfLines={1}>
        {value}
      </Text>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: { paddingHorizontal: theme.layout.margin, paddingVertical: theme.spacing.md },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing['3xl'],
    gap: theme.layout.sectionGap,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stats: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    paddingVertical: theme.spacing.lg,
    ...theme.elevation.card,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  block: { gap: theme.spacing.md },
  vehicles: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
});
