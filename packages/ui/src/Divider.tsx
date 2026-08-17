import { StyleSheet, View, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';

export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[styles.line, style]} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.border },
});
