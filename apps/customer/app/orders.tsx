import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR } from '@haala/shared';
import { Card, EmptyState, PriceText, StateView, StatusBadge, Text, theme } from '@haala/ui';
import { ordersApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';

export default function OrdersScreen() {
  const router = useRouter();
  const orders = useQuery({ queryKey: qk.orders, queryFn: ordersApi.list });
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await orders.refetch();
    setRefreshing(false);
  }, [orders]);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text variant="h1">Orders</Text>
      </View>

      <StateView
        loading={orders.isLoading}
        error={orders.error}
        isEmpty={!!orders.data && orders.data.length === 0}
        onRetry={() => orders.refetch()}
        empty={
          <EmptyState
            emoji="🧾"
            title="No orders yet"
            subtitle="Your orders will show up here."
            actionLabel="Start shopping"
            onAction={() => router.replace('/(tabs)')}
          />
        }
      >
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          {orders.data?.map((o) => (
            <Card key={o.id} onPress={() => router.push(`/order/${o.id}`)} style={styles.card}>
              <View style={styles.rowTop}>
                <Text variant="bodyStrong">{o.orderNumber}</Text>
                <StatusBadge status={o.status} />
              </View>
              <View style={styles.rowBottom}>
                <Text variant="caption" color="textSecondary">
                  {o.itemCount} items
                </Text>
                <PriceText amount={o.total} variant="title" />
              </View>
            </Card>
          ))}
        </ScrollView>
      </StateView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { padding: theme.spacing.lg },
  content: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing['2xl'],
    gap: theme.spacing.md,
  },
  card: { gap: theme.spacing.sm },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
