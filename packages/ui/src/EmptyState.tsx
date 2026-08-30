import { StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Button } from './Button';
import { Text } from './Text';

export interface EmptyStateProps {
  emoji?: string;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  emoji = '🛒',
  title,
  subtitle,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text variant="h3" align="center">
        {title}
      </Text>
      {subtitle ? (
        <Text variant="body" color="textSecondary" align="center">
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button label={actionLabel} onPress={onAction} fullWidth={false} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing['2xl'],
  },
  // lineHeight travels with fontSize: `Text` otherwise applies the `body`
  // variant's line box (17px), which slices a 48px glyph top and bottom.
  emoji: { fontSize: 48, lineHeight: 58, marginBottom: theme.spacing.sm },
  action: { marginTop: theme.spacing.lg },
});
