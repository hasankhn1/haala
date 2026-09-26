import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  NotificationCategory,
  QUIET_HOURS,
  type NotificationPreferencesView,
  type UpdateNotificationPreferencesInput,
} from '@haala/shared';
import { Icon, StateView, Text, theme, useToast } from '@haala/ui';
import { notificationsApi } from '../src/api/endpoints';
import { qk } from '../src/api/queryKeys';

/**
 * Notification settings, from `Haala Notifications.dc.html`: a switch per
 * category and quiet hours.
 *
 * Two departures from the comp, both deliberate. The "Haala sound" row is not
 * built — there is no sound yet, and a switch that changes nothing is worse
 * than no switch. And the canvas stays white rather than the comp's ember-50,
 * per the design system's fourth non-negotiable.
 *
 * These switches gate the push, not the inbox: a muted category still lands in
 * Notifications, it just doesn't buzz.
 */

const ROWS: { key: NotificationCategory; title: string; sub: string }[] = [
  { key: NotificationCategory.Order, title: 'Order updates', sub: 'Rider, arrival, delivered' },
  { key: NotificationCategory.Brand, title: 'Brand orders', sub: 'Shipping from partner brands' },
  {
    key: NotificationCategory.Payment,
    title: 'Payments & refunds',
    sub: 'Receipts, failed payments, refunds',
  },
  {
    key: NotificationCategory.Offer,
    title: 'Deals & restocks',
    sub: 'Flash deals, free delivery, favourites',
  },
  {
    key: NotificationCategory.Service,
    title: 'Store & service area',
    sub: 'Opening hours, new areas',
  },
];

/** 23 → "11:00 PM". */
const hourLabel = (hour: number): string =>
  `${hour % 12 === 0 ? 12 : hour % 12}:00 ${hour < 12 ? 'AM' : 'PM'}`;

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery({
    queryKey: qk.notificationPreferences,
    queryFn: notificationsApi.preferences,
  });

  /**
   * Optimistic: a switch that waits on the network before moving feels broken.
   * On failure the previous state comes back and the customer is told, rather
   * than left looking at a switch that lies.
   */
  const update = useMutation({
    mutationFn: notificationsApi.updatePreferences,
    onMutate: async (input: UpdateNotificationPreferencesInput) => {
      await qc.cancelQueries({ queryKey: qk.notificationPreferences });
      const previous = qc.getQueryData<NotificationPreferencesView>(qk.notificationPreferences);
      if (previous) {
        qc.setQueryData<NotificationPreferencesView>(qk.notificationPreferences, {
          categories: { ...previous.categories, ...input.categories },
          quietHours: input.quietHours ?? previous.quietHours,
        });
      }
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) qc.setQueryData(qk.notificationPreferences, context.previous);
      toast.show("Couldn't save that. Try again.", 'error');
    },
    // Refetch rather than writing the response in: two quick taps answer out of
    // order, and the older answer would un-flip the newer switch.
    onSettled: () => qc.invalidateQueries({ queryKey: qk.notificationPreferences }),
  });

  const prefs = query.data;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Go back">
          <Icon name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text variant="h2" style={styles.flex}>
          Notification settings
        </Text>
      </View>

      <StateView loading={query.isLoading} error={query.error} onRetry={() => query.refetch()}>
        {prefs ? (
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.card}>
              {ROWS.map((row, i) => (
                <SwitchRow
                  key={row.key}
                  title={row.title}
                  sub={row.sub}
                  on={prefs.categories[row.key]}
                  onToggle={() =>
                    update.mutate({ categories: { [row.key]: !prefs.categories[row.key] } })
                  }
                  leading={
                    <View
                      style={[
                        styles.swatch,
                        { backgroundColor: theme.notificationTints[row.key].fill },
                      ]}
                    />
                  }
                  divider={i < ROWS.length - 1}
                />
              ))}
            </View>

            <View style={[styles.card, styles.quiet]}>
              <SwitchRow
                title="Quiet hours"
                sub="Mute offers and service alerts"
                on={prefs.quietHours}
                onToggle={() => update.mutate({ quietHours: !prefs.quietHours })}
                flush
              />
              {prefs.quietHours ? (
                <>
                  <View style={styles.window}>
                    <TimeTile label="From" value={hourLabel(QUIET_HOURS.startHour)} />
                    <TimeTile label="To" value={hourLabel(QUIET_HOURS.endHour)} />
                  </View>
                  <Text variant="bodySm" color="textSecondary" style={styles.note}>
                    Also muted during Jummah (1–2 PM Fri). Live order updates always come through.
                  </Text>
                </>
              ) : null}
            </View>
          </ScrollView>
        ) : null}
      </StateView>
    </SafeAreaView>
  );
}

function SwitchRow({
  title,
  sub,
  on,
  onToggle,
  leading,
  divider = false,
  flush = false,
}: {
  title: string;
  sub: string;
  on: boolean;
  onToggle: () => void;
  leading?: ReactNode;
  divider?: boolean;
  /** No padding of its own — for a row that sits inside a padded card. */
  flush?: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      // React Native Web drops `accessibilityState`, so the label carries it too.
      accessibilityLabel={`${title}, ${on ? 'on' : 'off'}`}
      style={[styles.row, !flush && styles.rowPadded, divider && styles.divider]}
    >
      {leading}
      <View style={styles.flex}>
        <Text variant="label">{title}</Text>
        <Text variant="bodySm" color="textSecondary">
          {sub}
        </Text>
      </View>
      <View style={[styles.track, on ? styles.trackOn : styles.trackOff]}>
        <View style={[styles.thumb, on ? styles.thumbOn : styles.thumbOff]} />
      </View>
    </Pressable>
  );
}

function TimeTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timeTile}>
      <Text variant="caption" color="textSecondary">
        {label}
      </Text>
      <Text variant="title" style={styles.timeValue}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.sm,
    paddingBottom: 14,
  },
  content: {
    gap: 14,
    paddingHorizontal: 14,
    paddingBottom: theme.spacing.xl,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
    overflow: 'hidden',
  },
  quiet: { padding: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  rowPadded: { paddingVertical: 13, paddingHorizontal: 14 },
  divider: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  track: { width: 44, height: 26, borderRadius: 13, justifyContent: 'center' },
  trackOn: { backgroundColor: theme.colors.primary },
  trackOff: { backgroundColor: theme.colors.borderStrong },
  thumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: theme.colors.surface,
  },
  thumbOn: { right: 3 },
  thumbOff: { left: 3 },
  window: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  timeTile: {
    flex: 1,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: 12,
    paddingVertical: theme.layout.elementGap,
    paddingHorizontal: theme.spacing.md,
  },
  timeValue: { marginTop: theme.spacing.xs },
  note: { marginTop: theme.layout.elementGap },
});
