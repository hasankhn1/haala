/**
 * Color primitives + semantic tokens for Haala.
 *
 * Brand is **Onyx & Ink** (Stitch design system `assets/75cac6f7…`): a premium,
 * high-contrast minimalism built on deep structural blacks ("Onyx") against
 * gallery-white surfaces ("Ink"). The palette is deliberately restricted —
 * visual interest comes from whitespace, type and tonal layering, never from
 * decorative color.
 *
 * Onyx is the ACTION color: primary CTAs, add-to-cart, active nav, selected
 * states. Green survives only as a *semantic* success/freshness signal (in
 * stock, delivered) — it is no longer the brand.
 */

/** Raw palette. Prefer the semantic tokens below over reaching in here. */
export const palette = {
  // Brand — Onyx. A slate-tinted black, never pure #000 (which reads harsh on OLED).
  onyx: {
    50: '#F8FAFC', // canvas
    100: '#F1F5F9', // input fill / muted surface
    200: '#E2E8F0', // border
    300: '#CBD5E1', // border strong
    400: '#94A3B8', // disabled / tertiary text
    500: '#64748B', // secondary text ("Slate Subtle")
    600: '#475569',
    700: '#334155',
    800: '#1E293B', // pressed
    900: '#0F172A', // primary — Onyx
    950: '#020617',
  },
  /** Indigo Ink — tonal accent for status chips and ink-tinted shadows. */
  ink: {
    50: '#EEF2FF',
    100: '#E0E7FF',
    500: '#4338CA',
    700: '#312E81',
    900: '#1E1B4B', // Indigo Ink
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
  primary: palette.onyx[900],
  primaryPressed: palette.onyx[800],
  primarySoft: palette.onyx[100],
  onPrimary: palette.neutral[0],

  // Tonal accent (status chips, ink-tinted emphasis)
  accent: palette.ink[900],
  accentSoft: palette.ink[50],

  // Surfaces & backgrounds
  /** Base canvas — slightly off-white so white cards lift off it. */
  background: palette.onyx[50],
  /** Elevated containers: cards, sheets, inputs at rest. */
  surface: palette.neutral[0],
  surfaceMuted: palette.onyx[100],
  overlay: 'rgba(15, 23, 42, 0.45)',

  // Text
  textPrimary: palette.onyx[900],
  textSecondary: palette.onyx[500],
  textTertiary: palette.onyx[400],
  textInverse: palette.neutral[0],
  textDisabled: palette.onyx[400],

  // Borders / dividers — "favor negative space over dividers"; when needed, hairline.
  border: palette.onyx[200],
  borderStrong: palette.onyx[300],

  // Semantic states
  success: palette.green[500],
  successSoft: palette.green[50],
  error: palette.red[600],
  errorSoft: palette.red[50],
  warning: palette.amber[500],
  warningSoft: palette.amber[50],
  info: palette.ink[500],
  infoSoft: palette.ink[50],

  // Disabled / secondary UI
  disabled: palette.onyx[200],
  onDisabled: palette.onyx[400],
} as const;

/**
 * Status → color mapping for order/delivery badges.
 *
 * Per the Onyx guidelines these are **tonal, not vivid**: ultra-pale slate /
 * indigo fills with ink text. Only `delivered` earns green (a completion
 * signal) and terminal failures earn red.
 */
export const statusColors = {
  placed: { fg: palette.onyx[700], bg: palette.onyx[100] },
  confirmed: { fg: palette.ink[900], bg: palette.ink[50] },
  preparing: { fg: palette.ink[900], bg: palette.ink[50] },
  packed: { fg: palette.ink[900], bg: palette.ink[50] },
  picked_up: { fg: palette.ink[900], bg: palette.ink[100] },
  nearby: { fg: palette.ink[900], bg: palette.ink[100] },
  out_for_delivery: { fg: palette.neutral[0], bg: palette.onyx[900] },
  delivered: { fg: palette.green[700], bg: palette.green[50] },
  cancelled: { fg: palette.red[700], bg: palette.red[50] },
  failed: { fg: palette.red[700], bg: palette.red[50] },
} as const;

export type SemanticColor = keyof typeof colors;
export type StatusColorKey = keyof typeof statusColors;
