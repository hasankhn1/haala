/**
 * Color primitives + semantic tokens for Haala.
 *
 * Brand is **Basket** (Claude Design project "Grocery App Design System"): a
 * warm, appetising palette built on a burnt-orange action color over a beige
 * canvas, with warm near-black type. It replaced **Onyx & Ink** — the cool
 * slate/gallery-white system — on 2026-08-29. Food retail reads better warm;
 * the austere slate belonged to a different kind of product.
 *
 * Ember orange is the ACTION color: primary CTAs, add-to-cart, active nav,
 * prices, selected states. Clay 900 (`#26211E`) is the CONTRAST surface —
 * the free-delivery card, the "15 min" pill, dark promo banners — used where
 * a section needs to sit forward without shouting. Sun yellow is reserved for
 * savings and progress, never for chrome. Green survives only as a semantic
 * success signal.
 *
 * Semantic token *names* are unchanged from the previous system on purpose:
 * a re-theme should move values, not force every component to be rewritten.
 */

/** Raw palette. Prefer the semantic tokens below over reaching in here. */
export const palette = {
  /** Brand — Ember. Burnt orange; the single source of visual heat. */
  ember: {
    50: '#FFF6EF', // faintest wash — category tile backing
    100: '#FFEDE4', // soft fill — "Top offers" tile, selected chips
    200: '#FFD9C6',
    500: '#FF5A1F', // primary — Ember
    600: '#E8480F', // pressed / links
    700: '#B93705', // link hover, danger-adjacent emphasis
  },
  /**
   * Clay — the warm neutral ramp. Everything structural is built from this:
   * canvas, borders, type. Warm-tinted throughout, never a cool grey.
   */
  clay: {
    50: '#F7F3EF',
    100: '#F1EBE4', // muted surface / tile fill
    150: '#EDE7E0', // canvas
    200: '#EDE5DE', // border
    300: '#D6C9BE', // border strong
    400: '#C6B7AA', // placeholder ink
    500: '#A99B90', // tertiary text
    600: '#857569', // secondary text
    700: '#5C4E44',
    800: '#3D3128', // shadow tint
    900: '#26211E', // contrast surface — dark cards, pills, banners
    950: '#191410', // primary text
  },
  /** Sun — savings, progress, "best value". Never chrome. */
  sun: {
    100: '#FFF4CC',
    500: '#FFD84D',
  },
  // Semantic hues.
  green: { 50: '#DCFCE7', 100: '#BBF7D0', 500: '#16A34A', 600: '#15803D', 700: '#166534' },
  red: { 50: '#FEF2F2', 500: '#DC2626', 600: '#BA1A1A', 700: '#93000A' },
  amber: { 50: '#FFFBEB', 500: '#F59E0B', 600: '#D97706' },
  neutral: { 0: '#FFFFFF', 1000: '#000000' },
} as const;

/**
 * Semantic color tokens — this is what components should consume.
 */
export const colors = {
  // Actions
  primary: palette.ember[500],
  primaryPressed: palette.ember[600],
  primarySoft: palette.ember[100],
  onPrimary: palette.neutral[0],

  /**
   * Contrast surface. Not an accent in the decorative sense — it is the dark
   * warm panel the design uses to lift one block off the canvas.
   */
  accent: palette.clay[900],
  accentSoft: palette.clay[100],

  // Surfaces & backgrounds
  /** Base canvas — warm beige so white cards lift off it. */
  background: palette.clay[150],
  /** Elevated containers: cards, sheets, inputs at rest. */
  surface: palette.neutral[0],
  surfaceMuted: palette.clay[100],
  overlay: 'rgba(25, 20, 16, 0.45)',

  // Text
  textPrimary: palette.clay[950],
  textSecondary: palette.clay[600],
  textTertiary: palette.clay[500],
  textInverse: palette.neutral[0],
  textDisabled: palette.clay[400],

  // Borders / dividers — hairline, warm, and used sparingly.
  border: palette.clay[200],
  borderStrong: palette.clay[300],

  /** Savings, discount badges and the free-delivery progress fill. */
  promo: palette.sun[500],
  promoSoft: palette.sun[100],
  onPromo: palette.clay[900],

  // Semantic states
  success: palette.green[500],
  successSoft: palette.green[50],
  error: palette.red[600],
  errorSoft: palette.red[50],
  warning: palette.amber[500],
  warningSoft: palette.amber[50],
  info: palette.ember[600],
  infoSoft: palette.ember[50],

  // Disabled / secondary UI
  disabled: palette.clay[200],
  onDisabled: palette.clay[500],
} as const;

/**
 * Status → color mapping for order/delivery badges.
 *
 * Warm tonal fills with ember text for anything in flight, so the pipeline
 * reads as one family. Only `out_for_delivery` earns the solid ember fill —
 * it is the state the customer is actually watching. `delivered` earns green
 * as a completion signal and terminal failures earn red.
 */
export const statusColors = {
  placed: { fg: palette.clay[700], bg: palette.clay[100] },
  confirmed: { fg: palette.ember[700], bg: palette.ember[50] },
  preparing: { fg: palette.ember[700], bg: palette.ember[50] },
  packed: { fg: palette.ember[700], bg: palette.ember[100] },
  picked_up: { fg: palette.ember[700], bg: palette.ember[100] },
  nearby: { fg: palette.clay[900], bg: palette.sun[500] },
  out_for_delivery: { fg: palette.neutral[0], bg: palette.ember[500] },
  delivered: { fg: palette.green[700], bg: palette.green[50] },
  cancelled: { fg: palette.red[700], bg: palette.red[50] },
  failed: { fg: palette.red[700], bg: palette.red[50] },
} as const;

export type SemanticColor = keyof typeof colors;
export type StatusColorKey = keyof typeof statusColors;
