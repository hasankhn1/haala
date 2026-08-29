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

/**
 * Sizes read off the comps, not inherited.
 *
 * Basket is a **dense, small-type** system: 83% of the type in
 * `Grocery App.dc.html` is 13px or smaller, the most common size is 11.5px, and
 * only seven declarations in the whole design are 18px or larger — all of them
 * hero numbers. The previous system's scale (body 16, h3 20, h2 24) rendered
 * every screen roughly a third oversized.
 *
 * The design frame is 412px wide, so these map to dp very nearly 1:1.
 */
export const fontSize = {
  caption: 10.5,
  labelSm: 11,
  label: 11.5,
  bodySm: 11.5,
  body: 12.5,
  title: 14,
  h3: 14.5,
  h2: 17,
  h1: 20,
  display: 30,
  displayLg: 40,
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
    lineHeight: 44,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.6,
  },
  display: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.display,
    lineHeight: 34,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.6,
  },
  h1: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.h1,
    lineHeight: 25,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.2,
  },
  h2: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.h2,
    lineHeight: 21,
    fontWeight: fontWeight.extrabold,
    letterSpacing: -0.17,
  },
  h3: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.h3,
    lineHeight: 19,
    fontWeight: fontWeight.extrabold,
  },
  /** Product names, store names, order status. */
  title: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.title,
    lineHeight: 18,
    fontWeight: fontWeight.extrabold,
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.body,
    lineHeight: 17,
    fontWeight: fontWeight.regular,
  },
  bodyStrong: {
    fontFamily: fontFamily.extrabold,
    fontSize: fontSize.body,
    lineHeight: 17,
    fontWeight: fontWeight.extrabold,
  },
  bodySm: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.bodySm,
    lineHeight: 15,
    fontWeight: fontWeight.regular,
  },
  /** Button/label text. */
  label: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.label,
    lineHeight: 14,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.11,
  },
  labelSm: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.labelSm,
    lineHeight: 14,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.5,
  },
  /** Section eyebrows: "DELIVERY DETAILS", "ORDER SUMMARY", "LIMITED TIME". */
  labelCaps: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.caption,
    lineHeight: 14,
    fontWeight: fontWeight.bold,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  /** Secondary metadata: units, delivery fees, supporting info. */
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fontSize.caption,
    lineHeight: 14,
    fontWeight: fontWeight.regular,
  },
  /** Prominent price emphasis inline. */
  price: {
    fontFamily: fontFamily.bold,
    fontSize: fontSize.title,
    lineHeight: 24,
    fontWeight: fontWeight.bold,
    letterSpacing: -0.14,
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
