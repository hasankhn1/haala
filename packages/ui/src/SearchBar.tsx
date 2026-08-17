import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, TextInput, View, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface SearchBarProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  /** When set, the bar renders as a button (navigates to a search screen). */
  onPress?: () => void;
  autoFocus?: boolean;
  onClear?: () => void;
  /** Show the trailing voice-search affordance (Home). */
  showVoice?: boolean;
  onVoicePress?: () => void;
  style?: ViewStyle;
}

/**
 * Search field. Borderless white on the off-white canvas, lifted by the ambient
 * ink shadow rather than an outline — the Onyx way of separating a surface.
 *
 * Pass `onPress` (no input) to use it as a tappable entry on Home, or
 * `value`/`onChangeText` for a live search field.
 */
export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search for milk, eggs, bread…',
  onPress,
  autoFocus,
  onClear,
  showVoice = false,
  onVoicePress,
  style,
}: SearchBarProps) {
  const content = (
    <View style={[styles.bar, style]}>
      <Ionicons name="search" size={20} color={theme.colors.textSecondary} />
      {onPress ? (
        <Text variant="body" color="textTertiary" style={styles.flex} numberOfLines={1}>
          {placeholder}
        </Text>
      ) : (
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.colors.textTertiary}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
        />
      )}
      {value ? (
        <Pressable onPress={onClear} hitSlop={8} accessibilityLabel="Clear search">
          <Ionicons name="close-circle" size={18} color={theme.colors.textTertiary} />
        </Pressable>
      ) : showVoice ? (
        <Pressable onPress={onVoicePress} hitSlop={8} accessibilityLabel="Search by voice">
          <Ionicons name="mic-outline" size={20} color={theme.colors.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole="search">
        {content}
      </Pressable>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    height: theme.controlHeight.md,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: theme.spacing.lg,
    ...theme.elevation.card,
  },
  flex: { flex: 1 },
  input: {
    flex: 1,
    fontFamily: theme.typography.fontFamily.regular,
    fontSize: theme.typography.fontSize.body,
    color: theme.colors.textPrimary,
    padding: 0,
  },
});
