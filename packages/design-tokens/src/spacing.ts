/**
 * Spacing & shape. The 8px rhythm with 4px half-steps carries over from the
 * previous system unchanged — Basket differs in colour and roundness, not in
 * measure. Sections still breathe; dividers are still avoided.
 */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const spacing = {
  none: space[0],
  xs: space[1], // 4
  sm: space[2], // 8
  md: space[3], // 12
  lg: space[4], // 16
  xl: space[6], // 24
  '2xl': space[8], // 32
  '3xl': space[10], // 40
  '4xl': space[12], // 48
} as const;

/**
 * Layout rhythm from the design system's spacing scale. `margin` is the screen
 * edge inset ("framed gallery" effect); `sectionGap` is the 32px+ breathing
 * room between content sections that keeps the UI off a crowded-supermarket
 * feel.
 */
export const layout = {
  /** Screen horizontal inset (mobile). */
  margin: space[4], // 16
  /** Gutter between grid columns. */
  gutter: space[6], // 24
  /** Vertical gap between major sections. */
  sectionGap: space[8], // 32
  /** Gap between sibling elements inside a section. */
  elementGap: space[3], // 12
} as const;

/**
 * Corner radii. Basket is a **round** system — the comp uses pills for every
 * chip, tag and control, 13–16px for cards and 18–26px for hero surfaces.
 * Softness is doing the same job the old system asked of whitespace.
 */
export const radii = {
  none: 0,
  xs: 10, // small tags, badges
  sm: 14, // buttons, inputs, search field
  md: 16, // cards, banner tiles
  lg: 20, // media, category tiles
  xl: 26, // hero header sweep, sheets
  pill: 999,
  full: 9999,
} as const;

/**
 * Minimum interactive target — every tappable element should be at least
 * this size.
 */
export const touchTarget = {
  min: 48,
} as const;

/**
 * Control heights. The Onyx primary button is a fixed 52px so it "feels
 * substantial and high-quality".
 */
export const controlHeight = {
  sm: 40,
  md: 48,
  lg: 52,
} as const;

export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
