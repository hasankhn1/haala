import type { ReactNode } from 'react';
import { Pressable, View, type ViewStyle } from 'react-native';
import { theme } from '@haala/design-tokens';

export interface CardProps {
  children: ReactNode;
  padded?: boolean;
  onPress?: () => void;
  style?: ViewStyle;
}

/**
 * Grouped surface.
 *
 * Basket's canvas is white, so a white fill plus a shadow would not read as a
 * card at all — the comps separate blocks with a warm hairline instead, and
 * reserve fills for wells that hold something (imagery, controls). Hence
 * border, no shadow.
 */
export function Card({ children, padded = true, onPress, style }: CardProps) {
  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: padded ? theme.spacing.lg : 0,
    ...style,
  };
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [cardStyle, pressed && { opacity: 0.85 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}
