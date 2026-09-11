import { Pressable, StyleSheet, View } from 'react-native';
import { BottomSheet, Icon, Text, theme } from '@haala/ui';
import { SORT_OPTIONS, type SortKey } from './filters';

/** The "Sort" chip's bottom sheet — a single-choice radio list. */
export function SortSheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value: SortKey;
  onPick: (key: SortKey) => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Sort by" accessibilityLabel="Sort products">
      {SORT_OPTIONS.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            style={styles.row}
            onPress={() => {
              onPick(o.key);
              onClose();
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}${on ? ', selected' : ''}`}
          >
            <Text variant={on ? 'bodyStrong' : 'body'} style={styles.flex}>
              {o.label}
            </Text>
            <View style={[styles.ring, on && styles.ringOn]}>
              {on ? <Icon name="checkmark" size={13} color={theme.colors.onPrimary} /> : null}
            </View>
          </Pressable>
        );
      })}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  flex: { flex: 1 },
  ring: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary },
});
