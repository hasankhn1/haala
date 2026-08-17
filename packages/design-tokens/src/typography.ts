/**
 * Typography — **Plus Jakarta Sans**, the Onyx & Ink type voice. Geometric,
 * slightly condensed, and high-contrast at display sizes; it carries the
 * "institutional precision" the design system asks for.
 *
 * React Native does not synthesise weights for custom fonts: each weight is a
 * separate family. So `fontFamily` is keyed by weight and every text style
 * names the exact family it needs. Apps must load these via `expo-font`
 * (`@expo-google-fonts/plus-jakarta-sans`) before rendering — see the customer
 * app's root layout, which holds the splash screen until they resolve.
 */

export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  /** Escape hatch / fallback before fonts load. */
  system: 'System',
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

export const fontSize = {
  caption: 12,
  label: 14,
  bodySm: 14,
  body: 16,
  title: 18,
  h3: 20,
  h2: 24,
  h1: 32,
  display: 40,
  displayLg: 48,
} as const;

type TextStyle = {
  fontFamily: (typeof fontFamily)[keyof typeof fontFamily];
  fontSize: number;
  lineHeight: number;
  fontWeight: (typeof fontWeight)[keyof typeof fontWeight];
  letterSpacing?: number;
  textTransform?: 'uppercase';
};

/**
 * Named text styles — the building blocks screens should use directly.
 *
 * Onyx letter-spacing is expressed in `em` upstream; RN takes absolute points,
 * so each value is pre-multiplied by its font size.
 */
export const textStyles = {
  /** Hero numbers: the "8 mins" ETA, order totals on confirmation. */
  displayLg: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.displayLg,
    lineHeight: 56,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.96,
  },
  display: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.display,
    lineHeight: 48,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.8,
  },
  h1: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.h1,
    lineHeight: 40,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.32,
  },
  h2: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.h2,
    lineHeight: 32,
    fontWeight: fontWeight.semibold,
    letterSpacing: -0.24,
  },
  h3: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.h3,
    lineHeight: 28,
    fontWeight: fontWeight.semibold,
  },
  /** Product names, store names, order status. */
  title: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.title,
    lineHeight: 26,
    fontWeight: fontWeight.semibold,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontWeight: fontWeight.regular,
  },
  bodyStrong: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontWeight: fontWeight.semibold,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    lineHeight: 20,
    fontWeight: fontWeight.regular,
  },
  /** Button/label text. */
  label: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.label,
    lineHeight: 20,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.14,
  },
  labelSm: {
    fontFamily: fontFamily.semibold,
    fontSize: fontSize.caption,
    lineHeight: 16,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
  },
  /** Section eyebrows: "DELIVERY DETAILS", "ORDER SUMMARY", "LIMITED TIME". */
  labelCaps: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    lineHeight: 16,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.96,
    textTransform: 'uppercase',
  },
  /** Secondary metadata: units, delivery fees, supporting info. */
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: 16,
    fontWeight: fontWeight.regular,
  },
  /** Prominent price emphasis inline. */
  price: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.title,
    lineHeight: 24,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.18,
  },
} as const satisfies Record<string, TextStyle>;

export type TextStyleToken = keyof typeof textStyles;

/** Every custom family the app must load before first paint. */
export const REQUIRED_FONT_FAMILIES = [
  fontFamily.regular,
  fontFamily.medium,
  fontFamily.semibold,
  fontFamily.bold,
  fontFamily.extrabold,
] as const;
