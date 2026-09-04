import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Text } from './Text';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /**
   * When false, tapping the backdrop and the Android back button no longer
   * close the sheet — it can only be dismissed by something inside it.
   *
   * For a sheet asking for information an order cannot proceed without, where
   * a stray backdrop tap would drop the customer back onto a screen whose
   * primary button then refuses to work. The sheet still needs its own way out;
   * this only removes the *accidental* ones.
   */
  dismissible?: boolean;
  children: ReactNode;
  /** Marks the sheet as a modal region for screen readers. */
  accessibilityLabel?: string;
}

/** Lightweight bottom sheet built on RN Modal — no extra native deps. */
export function BottomSheet({
  visible,
  onClose,
  title,
  dismissible = true,
  children,
  accessibilityLabel,
}: BottomSheetProps) {
  const close = dismissible ? onClose : () => undefined;
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={close}
      statusBarTranslucent
    >
      <View
        style={styles.container}
        // Content behind a sheet should not be reachable by a swipe-through.
        accessibilityViewIsModal
        accessibilityLabel={accessibilityLabel}
      >
        <Pressable
          style={styles.backdrop}
          onPress={close}
          // Not a target at all when the sheet cannot be dismissed, so a
          // screen reader does not offer a control that does nothing.
          accessible={dismissible}
          accessibilityRole={dismissible ? 'button' : undefined}
          accessibilityLabel={dismissible ? 'Close' : undefined}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            {title ? (
              <Text variant="h3" style={styles.title}>
                {title}
              </Text>
            ) : null}
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.overlay },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing['2xl'],
    ...theme.elevation.sheet,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
    marginBottom: theme.spacing.md,
  },
  title: { marginBottom: theme.spacing.md },
});
