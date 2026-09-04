/**
 * Color primitives + semantic tokens for Haala.
 *
 * Brand is **Basket** (Claude Design project "Grocery App Design System"): a
 * warm, appetising palette built on a burnt-orange action color over a white
 * canvas, with warm near-black type. It replaced **Onyx & Ink** — the cool
 * slate/gallery-white system — on 2026-08-29. Food retail reads better warm;
 * the austere slate belonged to a different kind of product.
 *
 * The canvas is **white**; warmth arrives as accents — clay wells behind
 * imagery, soft ember washes, and hairline borders — never as a page tint.
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
    /**
     * The three below arrived with `Auth & Checkout.dc.html`, which needed
     * gentler steps than the grocery comps between white and ember 200.
     *
     * 25 serves two values the comp draws separately, `#FFFBF7` and `#FFFCF7`
     * — they differ by one unit in a single channel, which is not a difference
     * anybody can see and not one worth two tokens.
     */
    25: '#FFFBF7', // faintest wash — a card whose field is still empty
    50: '#FFF6EF', // faintest wash — category tile backing
    75: '#FFF1E6', // icon tile inside a sheet
    100: '#FFEDE4', // soft fill — "Top offers" tile, selected chips
    150: '#FFCBA8', // edge on a card asking for something
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
    50: '#F7F3EF', // sunken — product image blocks, PDP hero
    100: '#F1EBE4', // muted surface — category tiles, stepper fill
    200: '#EDE5DE', // border / hairline
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
  green: {
    25: '#EAF6EF', // soft ground behind a confirmation tick
    50: '#DCFCE7',
    100: '#BBF7D0',
    500: '#16A34A',
    /**
     * The auth comps' green, and a **muted** one — it has to sit beside ember
     * on a warm ground without shouting. Took the 600 slot because nothing
     * referenced the vivid `#15803D` that was here.
     *
     * Worth knowing: `success` above is still `#16A34A`, which reads as a
     * pre-Basket leftover next to this. They should probably converge, but
     * `success` colours the cart, the bill and the delivery states, so that is
     * a visual change to make deliberately rather than in passing.
     */
    600: '#2F7D5B',
    700: '#166534',
  },

  /**
   * Warm sand — hairlines and ink a step warmer than `clay`, from the auth
   * comps. Only three steps exist because only three are used; a full ramp
   * invented ahead of need is a ramp nobody trusts.
   */
  sand: {
    200: '#F2E4D6', // hairline around an ember wash
    300: '#E0C9AE', // dashed edge on the reserved row
    500: '#B98A4E', // the icon on it
    700: '#8A6636', // ink on that row
  },
  red: { 50: '#FEF2F2', 500: '#DC2626', 600: '#BA1A1A', 700: '#93000A' },

  /**
   * Warm red, for telling somebody something went wrong **on a warm ground**.
   *
   * A second red family needs justifying, so: `red` above is a cool,
   * high-chroma red inherited from before Basket, and the auth comps' error
   * card is a warm one that sits in the same world as ember. Dropping `red`'s
   * values onto that card makes it look like a browser alert pasted onto the
   * page. Retuning `red` itself was the other option, but it colours the
   * cancelled and failed order states in three apps, so that is a visual change
   * to make on purpose rather than as a side effect of styling a sign-in
   * screen.
   *
   * Use `rust` on warm surfaces, `red` for hard failure states.
   */
  rust: {
    50: '#FEF1EE', // card ground
    100: '#F6CFC5', // card hairline
    400: '#A0503C', // the explanation
    800: '#8E2814', // what went wrong
  },
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
  /**
   * Base canvas — **white**.
   *
   * Do not put `#EDE7E0` here. That colour appears exactly once in the design
   * source, inside the `<helmet>` block styling the design document's own page:
   * it is the ground *behind the phone frame*, not an app colour. The app shell
   * is `background:#fff`, which the comps use 23 times. Getting this wrong
   * tints every screen and makes white cards invisible.
   */
  background: palette.neutral[0],
  /** Elevated containers on a tinted ground — the search field on the ember
   *  hero, the success card. On the white canvas these need a border, not a fill. */
  surface: palette.neutral[0],
  /** Tile and control fills: category tiles, quantity steppers. */
  surfaceMuted: palette.clay[100],
  /** Sunken wells that hold imagery: product cards, the PDP hero. */
  surfaceSunken: palette.clay[50],
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

  /**
   * Confirmed, as distinct from `success`. Used where something the customer
   * just entered is now known to be good — a valid phone field's border, the
   * "saved to your account" line — rather than for an outcome like a delivered
   * order.
   */
  confirmed: palette.green[600],

  // ── Surfaces and edges from the auth comps ────────────────────────────────
  /** A card that is waiting for something: faintest ember over white. */
  surfaceAttention: palette.ember[25],
  /** Its edge — ember-family, deliberately not `warning`. Nothing is wrong. */
  borderAttention: palette.ember[150],
  /** The icon tile inside a bottom sheet. */
  emberTile: palette.ember[75],
  /** Hairline on an ember wash, a step warmer than `border`. */
  borderWarm: palette.sand[200],
  /** The dashed edge, icon and ink of a row reserved but not yet real. */
  borderReserved: palette.sand[300],
  iconReserved: palette.sand[500],
  textReserved: palette.sand[700],

  /** Ground behind a confirmation tick — softer than `successSoft`'s mint. */
  confirmedSoft: palette.green[25],

  /**
   * An explanation of something that failed, on a warm surface. Distinct from
   * `error`, which is for a hard failure; see the `rust` note above.
   */
  surfaceAlert: palette.rust[50],
  borderAlert: palette.rust[100],
  textAlert: palette.rust[800],
  textAlertSoft: palette.rust[400],

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
