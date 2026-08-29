import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface AddressCardProps {
  label: string;
  line: string;
  selected?: boolean;
  actionLabel?: string;
  onPress?: () => void;
}

const ICON: Record<string, IconName> = {
  home: 'home',
  work: 'briefcase',
  other: 'location',
};

export function AddressCard({ label, line, selected, actionLabel, onPress }: AddressCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && { opacity: 0.9 },
      ]}
    >
      <View style={[styles.icon, selected && styles.iconSelected]}>
        <Icon
          name={ICON[label.toLowerCase()] ?? 'location'}
          size={18}
          color={selected ? theme.colors.onPrimary : theme.colors.primary}
        />
      </View>
      <View style={styles.body}>
        <Text variant="bodyStrong" style={{ textTransform: 'capitalize' }}>
          {label}
        </Text>
        <Text variant="bodySm" color="textSecondary" numberOfLines={1}>
          {line}
        </Text>
      </View>
      {actionLabel ? (
        <Text variant="label" color="primary">
          {actionLabel}
        </Text>
      ) : selected ? (
        <Icon name="checkmark-circle" size={22} color={theme.colors.primary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.lg,
  },
  selected: { borderColor: theme.colors.primary },
  icon: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSelected: { backgroundColor: theme.colors.primary },
  body: { flex: 1, gap: 2 },
});
