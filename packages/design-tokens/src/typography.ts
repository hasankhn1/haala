/**
 * Typography — **Plus Jakarta Sans**, which both the previous system and
 * Basket share; it is the one thing the re-theme did not change.
 *
 * What did change is weight. Basket sets headings, prices and product names in
 * **extrabold (800)** rather than semibold — on a warm canvas the type is
 * doing the work the old system gave to whitespace and hairlines. Body copy
 * stays regular so the contrast between the two is the hierarchy.
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
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.displayLg,
    lineHeight: 56,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.96,
  },
  display: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.display,
    lineHeight: 48,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.8,
  },
  h1: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.h1,
    lineHeight: 40,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.32,
  },
  h2: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.h2,
    lineHeight: 32,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.24,
  },
  h3: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.h3,
    lineHeight: 28,
    fontWeight: fontWeight.extrabold,
  },
  /** Product names, store names, order status. */
  title: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.title,
    lineHeight: 26,
    fontWeight: fontWeight.extrabold,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontWeight: fontWeight.regular,
  },
  bodyStrong: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.body,
    lineHeight: 24,
    fontWeight: fontWeight.extrabold,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    lineHeight: 20,
    fontWeight: fontWeight.regular,
  },
  /** Button/label text. */
  label: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    lineHeight: 20,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.14,
  },
  labelSm: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    lineHeight: 16,
    fontWeight: fontWeight.bold,
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
