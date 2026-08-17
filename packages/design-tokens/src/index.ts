export * from './colors';
export * from './spacing';
export * from './typography';
export * from './elevation';

import { colors, palette, statusColors } from './colors';
import { spacing, radii, space, layout, touchTarget, controlHeight } from './spacing';
import {
  fontFamily,
  fontWeight,
  fontSize,
  textStyles,
  REQUIRED_FONT_FAMILIES,
} from './typography';
import { elevation } from './elevation';

/**
 * Assembled theme object — the **Onyx & Ink** design system. Apps read tokens
 * from here so the whole look is swappable in one place.
 */
export const theme = {
  colors,
  palette,
  statusColors,
  spacing,
  space,
  layout,
  radii,
  touchTarget,
  controlHeight,
  typography: { fontFamily, fontWeight, fontSize, textStyles, REQUIRED_FONT_FAMILIES },
  elevation,
} as const;

export type Theme = typeof theme;
