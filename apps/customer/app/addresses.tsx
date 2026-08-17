import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AddressCard,
  Button,
  EmptyState,
  IconButton,
  StateView,
  Text,
  theme,
  useToast,
} from '@haala/ui';
import { ApiError } from '../src/api/client';
import { addressesApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';

/**
 * Saved addresses.
 *
 * Creating an address goes through the map picker (`/address/select`) — it is
 * the only path that captures real coordinates, which the store-serviceability
 * check and delivery routing both depend on.
 */
export default function AddressesScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const addresses = useQuery({ queryKey: qk.addresses, queryFn: addressesApi.list });

  const setDefault = useMutation({
    mutationFn: (id: string) => addressesApi.setDefault(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.addresses }),
    onError: (e) =>
      toast.show(e instanceof ApiError ? e.message : 'Could not update address', 'error'),
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <Text variant="h2">Addresses</Text>
      </View>

      <StateView
        loading={addresses.isLoading}
        error={addresses.error}
        isEmpty={!!addresses.data && addresses.data.length === 0}
        onRetry={() => addresses.refetch()}
        empty={
          <EmptyState
            emoji="📍"
            title="No addresses yet"
            subtitle="Drop a pin on the map so we know where to deliver."
            actionLabel="Set delivery location"
            onAction={() => router.push('/address/select')}
          />
        }
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {addresses.data?.map((a) => (
            <AddressCard
              key={a.id}
              label={a.label}
              line={`${a.line1}, ${a.area}, ${a.city}`}
              selected={a.isDefault}
              actionLabel={a.isDefault ? undefined : 'Set default'}
              onPress={() => (a.isDefault ? undefined : setDefault.mutate(a.id))}
            />
          ))}

          <Button
            label="Add address"
            variant="secondary"
            onPress={() => router.push('/address/select')}
          />
        </ScrollView>
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingVertical: theme.spacing.md,
  },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.md,
  },
});
