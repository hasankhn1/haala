/**
 * Elevation. Hierarchy still comes from tonal layers and one diffused ambient
 * shadow rather than borders — but Basket's shadow is **warm-tinted** (clay
 * `#3D3128`) and carries more weight than the old whisper, because cards now
 * sit on a beige canvas rather than near-white and a 4% slate shadow would
 * simply vanish.
 *
 * Reference from the comp: `0 8px 20px rgba(38,33,30,.24)` on the dark
 * free-delivery card, `0 6px 18px rgba(120,40,0,.18)` on the search field
 * floating over the ember header.
 *
 * Each token carries iOS shadow props and an Android `elevation` so one token
 * drives both platforms. Android cannot render a tinted diffused shadow, so its
 * `elevation` values stay deliberately low — the design leans on surface
 * contrast, which survives the translation.
 */
const CLAY = '#3D3128';

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
    shadowColor: CLAY,
    shadowOpacity: 0.10,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  /** Sticky bottom CTA bar / floating action — slightly more present. */
  raised: {
    shadowColor: CLAY,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  /** Bottom sheets, dialogs, the tracking detail card over the map. */
  sheet: {
    shadowColor: CLAY,
    shadowOpacity: 0.22,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
} as const;

export type ElevationToken = keyof typeof elevation;
