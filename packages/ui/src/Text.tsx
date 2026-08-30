import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';
import { theme, type TextStyleToken } from '@haala/design-tokens';

type ColorToken = keyof typeof theme.colors;

export interface TextProps extends RNTextProps {
  variant?: TextStyleToken;
  color?: ColorToken;
  align?: TextStyle['textAlign'];
}

/**
 * Themed Text. Pick a typography token via `variant` and a semantic `color`.
 *
 * **Overriding `fontSize` in `style`? Override `lineHeight` too.** The variant's
 * line box does not scale with it, so a larger glyph is silently clipped — which
 * is exactly what happened to every empty-state icon when the type scale moved
 * `body` from a 24px line box to 17px. Neither typecheck nor bundling catches
 * it; only looking at the screen does.
 */
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
