/**
 * Elevation. Onyx & Ink establishes hierarchy through **tonal layers and a
 * single highly-diffused ambient shadow** — never borders, never a stack of
 * competing shadow styles. The shadow is ink-tinted (slate `#0F172A`) at very
 * low opacity so the lift reads as atmosphere rather than a drop shadow.
 *
 * Reference: `0px 10px 30px rgba(15, 23, 42, 0.04)`.
 *
 * Each token carries iOS shadow props and an Android `elevation` so one token
 * drives both platforms. Android cannot render a tinted diffused shadow, so its
 * `elevation` values stay deliberately low — the design leans on surface
 * contrast, which survives the translation.
 */
const INK = '#0F172A';

export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** Product cards, list rows, search field — the workhorse ambient lift. */
  card: {
    shadowColor: INK,
    shadowOpacity: 0.04,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 2,
  },
  /** Sticky bottom CTA bar / floating action — slightly more present. */
  raised: {
    shadowColor: INK,
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  /** Bottom sheets, dialogs, the tracking detail card over the map. */
  sheet: {
    shadowColor: INK,
    shadowOpacity: 0.12,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const;

export type ElevationToken = keyof typeof elevation;
