import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { theme } from '@haala/design-tokens';

export interface ScreenProps {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  /** Rendered pinned to the bottom, outside the scroll area (e.g. a sticky CTA). */
  footer?: ReactNode;
  edges?: readonly Edge[];
  backgroundColor?: string;
  contentStyle?: ViewStyle;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  footer,
  edges = ['top', 'left', 'right'],
  backgroundColor = theme.colors.background,
  contentStyle,
}: ScreenProps) {
  const inner = padded ? [styles.padded, contentStyle] : contentStyle;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor }]} edges={edges}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[inner, styles.scrollContent]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.flex, inner]}>{children}</View>
      )}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  padded: { padding: theme.spacing.lg },
  scrollContent: { paddingBottom: theme.spacing['2xl'], flexGrow: 1 },
  /**
   * Sticky footer. Onyx separates it from the scroll area with elevation and
   * whitespace rather than a rule — hence the raised ambient shadow and no
   * top border.
   */
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    ...theme.elevation.raised,
  },
});
