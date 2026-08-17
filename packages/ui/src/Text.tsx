import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { theme, type TextStyleToken } from '@haala/design-tokens';

type ColorToken = keyof typeof theme.colors;

export interface TextProps extends RNTextProps {
  variant?: TextStyleToken;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
}

/** Themed Text. Pick a typography token via `variant` and a semantic `color`. */
export function Text({
  variant = 'body',
  color = 'textPrimary',
  align,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[
        theme.typography.textStyles[variant],
        { color: theme.colors[color] },
        align ? { textAlign: align } : null,
        style,
      ]}
      {...rest}
    />
  );
}
