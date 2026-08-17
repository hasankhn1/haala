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
 * Elevated surface. Onyx cards are pure white on the off-white canvas with an
 * 8px radius and the single ambient ink shadow — **no border**.
 */
export function Card({ children, padded = true, onPress, style }: CardProps) {
  const cardStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: padded ? theme.spacing.lg : 0,
    ...theme.elevation.card,
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
