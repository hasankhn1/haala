import { useQuery } from '@tanstack/react-query';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DeliveryStatus, formatPKR, type DeliveryAssignmentView } from '@haala/shared';
import { EmptyState, StateView, StatusBadge, Text, theme } from '@haala/ui';
import { deliveryApi } from '../../src/api/endpoints';
import { qk } from '../../src/api/queryKeys';

const fmtDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1} · ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes(),
  ).padStart(2, '0')}`;
};

/** Everything this rider has ever been assigned, newest first. */
export default function HistoryScreen() {
  const assignments = useQuery({ queryKey: qk.assignments, queryFn: deliveryApi.list });
  const rows = assignments.data ?? [];

  const earned = rows
    .filter((a) => a.status === DeliveryStatus.Completed && a.codCollected)
    .reduce((sum, a) => sum + (a.codAmount ?? 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text variant="h1">History</Text>
        {rows.length > 0 ? (
          <Text variant="bodySm" color="textSecondary">
            {formatPKR(earned)} cash collected across {rows.length}{' '}
            {rows.length === 1 ? 'run' : 'runs'}
          </Text>
        ) : null}
      </View>

      <StateView
        loading={assignments.isLoading}
        error={assignments.error}
        isEmpty={!assignments.isLoading && rows.length === 0}
        onRetry={() => assignments.refetch()}
        empty={
          <EmptyState
            emoji="📦"
            title="No deliveries yet"
            subtitle="Completed runs will show up here."
          />
        }
      >
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {rows.map((a) => (
            <Row key={a.id} assignment={a} />
          ))}
        </ScrollView>
      </StateView>
    </SafeAreaView>
  );
}

function Row({ assignment: a }: { assignment: DeliveryAssignmentView }) {
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <Text variant="bodyStrong">{a.order.orderNumber}</Text>
        <StatusBadge status={a.status} />
      </View>
      <Text variant="bodySm" color="textSecondary" numberOfLines={1}>
        {a.order.dropoff.area}, {a.order.dropoff.city}
      </Text>
      <View style={styles.rowBetween}>
        <Text variant="caption" color="textSecondary">
          {fmtDate(a.deliveredAt ?? a.assignedAt)}
        </Text>
        <Text variant="labelSm">
          {a.codAmount !== null ? `Cash ${formatPKR(a.codAmount)}` : 'Prepaid'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  header: { paddingHorizontal: theme.layout.margin, paddingVertical: theme.spacing.md, gap: 2 },
  content: {
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing['3xl'],
    gap: theme.spacing.md,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.lg,
    gap: theme.spacing.sm,
    ...theme.elevation.card,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
