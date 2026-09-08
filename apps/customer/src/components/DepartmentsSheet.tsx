import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BottomSheet, Icon, Text, theme } from '@haala/ui';
import type { Department } from '../lib/departments';

/**
 * Every department, behind the home rail's "All N".
 *
 * **This is where coming-soon belongs.** The rail carries live departments
 * only, because a card a shopper can tap into is a different object from a
 * promise — and the comp never mixes them. An earlier version of this screen
 * put "Coming soon" in a second section on the home itself, which invented
 * information architecture the design does not have and pushed the things you
 * *can* buy further down the page.
 *
 * So the sheet is the one place the full range is stated: what is open, what is
 * coming, and how many categories are behind each.
 */
export function DepartmentsSheet({
  visible,
  onClose,
  departments,
  city,
  onOpen,
}: {
  visible: boolean;
  onClose: () => void;
  departments: Department[];
  city: string;
  onOpen: (key: string) => void;
}) {
  const liveCount = departments.filter((d) => d.isLive).length;

  return (
    <BottomSheet visible={visible} onClose={onClose} accessibilityLabel="Departments">
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text variant="h1">Departments</Text>
          <Text variant="body" color="textSecondary" style={styles.sub}>
            {liveCount} live in {city} · same shopping experience in each
          </Text>
        </View>
        <Pressable
          style={styles.close}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Icon name="close" size={14} color={theme.colors.textSecondary} strokeWidth={2.4} />
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid}>
        {departments.map((d) => (
          <Pressable
            key={d.key}
            style={({ pressed }) => [
              styles.card,
              // A department with nothing in it is drawn as a plain outline
              // rather than in its own colour: the tint is a shopfront, and a
              // shopfront you cannot walk into should not be lit.
              d.isLive
                ? { borderColor: d.tint, backgroundColor: theme.colors.surface }
                : { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceSunken },
              pressed && d.isLive ? styles.pressed : null,
            ]}
            // Not a button when there is nothing behind it — a screen reader
            // should not offer a control that goes nowhere.
            accessibilityRole={d.isLive ? 'button' : undefined}
            accessibilityLabel={d.isLive ? d.name : `${d.name}, coming soon`}
            disabled={!d.isLive}
            onPress={() => onOpen(d.key)}
          >
            <View
              style={[
                styles.tile,
                { backgroundColor: d.isLive ? d.tint : theme.colors.surfaceMuted },
              ]}
            >
              <Icon
                name={d.icon}
                size={20}
                color={d.isLive ? theme.colors.textInverse : theme.colors.textTertiary}
                strokeWidth={1.9}
              />
            </View>

            <Text
              variant="bodyStrong"
              color={d.isLive ? 'textPrimary' : 'textSecondary'}
              style={styles.name}
            >
              {d.name}
            </Text>
            <Text variant="caption" color="textSecondary" style={styles.meta} numberOfLines={2}>
              {d.isLive ? d.examples || 'Open now' : 'Coming soon'}
            </Text>

            {d.isLive ? null : (
              <View style={styles.soon}>
                <Text variant="labelSm" color="textSecondary" style={styles.soonText}>
                  SOON
                </Text>
              </View>
            )}
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.note}>
        <Text variant="caption" color="textSecondary" style={styles.noteText}>
          New departments appear here from the dashboard — the landing page, listing, filters and
          checkout are already built for them.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 16 },
  sub: { marginTop: 6, lineHeight: 18 },
  close: {
    width: 32,
    height: 32,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Capped so a long list scrolls inside the sheet rather than off the screen. */
  scroll: { maxHeight: 420, marginTop: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  card: {
    // Two per row, accounting for the 11px gap between them.
    width: '48%',
    flexGrow: 1,
    borderRadius: theme.radii.md,
    borderWidth: 1.6,
    padding: 13,
  },
  pressed: { opacity: 0.9 },
  tile: {
    width: 38,
    height: 38,
    borderRadius: theme.radii.md - 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { marginTop: 11 },
  meta: { marginTop: 5, lineHeight: 14 },
  soon: {
    position: 'absolute',
    right: 11,
    top: 11,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.xs - 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  soonText: { fontSize: 9, lineHeight: 13, letterSpacing: 0.4 },
  note: {
    marginTop: 16,
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.radii.sm - 2,
    padding: 12,
  },
  noteText: { lineHeight: 17 },
});
