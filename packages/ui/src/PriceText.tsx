import { View } from 'react-native';
import { formatPKR } from '@haala/shared';
import type { TextStyleToken } from '@haala/design-tokens';
import { Text } from './Text';

export interface PriceTextProps {
  amount: number; // paisa
  original?: number; // paisa, shown struck-through if greater
  variant?: TextStyleToken;
  color?: Parameters<typeof Text>[0]['color'];
}

export function PriceText({
  amount,
  original,
  variant = 'price',
  color = 'textPrimary',
}: PriceTextProps) {
  const showOriginal = original !== undefined && original > amount;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <Text variant={variant} color={color}>
        {formatPKR(amount)}
      </Text>
      {showOriginal ? (
        <Text variant="caption" color="textTertiary" style={{ textDecorationLine: 'line-through' }}>
          {formatPKR(original)}
        </Text>
      ) : null}
    </View>
  );
}
