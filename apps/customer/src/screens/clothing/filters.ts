import type { ProductView } from '@haala/shared';

/**
 * Clothing browse: filter + sort state, and the logic that applies it.
 *
 * Kept free of React and React-Native imports so it stays pure and unit
 * testable — see `filters.test.ts`. The screen owns the state; this module
 * owns the rules.
 *
 * **Backend seam.** `applyFilters` narrows and sorts *client-side* over the
 * products a listing already returns. That covers brand, price band, deals and
 * sort today, because every `ProductView` carries a brand, a price and a
 * base price. It cannot cover **size** and **colour**: the listing resolves one
 * default variant per product, so the per-variant size/colour breakdown is not
 * on the row. Those selections are collected here and handed to the server via
 * {@link buildProductQuery} — the contract the catalogue endpoint will grow.
 * Until it does, size/colour are a no-op on the client, by design.
 */

export type SortKey = 'recommended' | 'newest' | 'price_asc' | 'price_desc';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'recommended', label: 'Recommended' },
  { key: 'newest', label: 'Newest' },
  { key: 'price_asc', label: 'Price: Low to High' },
  { key: 'price_desc', label: 'Price: High to Low' },
];

export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];

/** Name + swatch, for the colour group's chips. Hex only feeds the swatch. */
export const COLOURS: { name: string; hex: string }[] = [
  { name: 'Black', hex: '#191410' },
  { name: 'White', hex: '#F4F1EC' },
  { name: 'Beige', hex: '#D9C7A8' },
  { name: 'Blue', hex: '#2C5C7A' },
  { name: 'Green', hex: '#3F6B3A' },
  { name: 'Red', hex: '#C0392B' },
  { name: 'Pink', hex: '#D98BA6' },
  { name: 'Yellow', hex: '#E8C34A' },
];

/** Price bands in **paisa** — money is integer paisa everywhere. `max: null` is
 *  the open-ended top band. */
export const PRICE_BANDS: { label: string; min: number; max: number | null }[] = [
  { label: 'Under Rs. 1,500', min: 0, max: 150_000 },
  { label: 'Rs. 1,500 – 3,000', min: 150_000, max: 300_000 },
  { label: 'Rs. 3,000 – 6,000', min: 300_000, max: 600_000 },
  { label: 'Over Rs. 6,000', min: 600_000, max: null },
];

export interface ClothingFilters {
  /** brandSlugs */
  brands: string[];
  sizes: string[];
  /** colour names */
  colours: string[];
  /** selected price-band labels */
  priceBands: string[];
  dealsOnly: boolean;
  sort: SortKey;
}

export const EMPTY_FILTERS: ClothingFilters = {
  brands: [],
  sizes: [],
  colours: [],
  priceBands: [],
  dealsOnly: false,
  sort: 'recommended',
};

/** Add/remove a value in one of the multi-select arrays. */
export const toggle = (list: string[], value: string): string[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const inSelectedBands = (pricePaisa: number, bandLabels: string[]): boolean =>
  PRICE_BANDS.filter((b) => bandLabels.includes(b.label)).some(
    (b) => pricePaisa >= b.min && (b.max === null || pricePaisa < b.max),
  );

const isDeal = (p: ProductView): boolean => p.basePrice > p.price;

function sortItems(items: ProductView[], sort: SortKey): ProductView[] {
  // Never mutate the query cache's array.
  const out = [...items];
  switch (sort) {
    case 'price_asc':
      return out.sort((a, b) => a.price - b.price);
    case 'price_desc':
      return out.sort((a, b) => b.price - a.price);
    case 'newest':
      // No timestamp on the row; the listing's own order is oldest-first, so
      // reversing is the best "newest" available until the server sorts.
      return out.reverse();
    case 'recommended':
    default:
      return out;
  }
}

/** Narrow and sort a listing for the current filters. See the module note for
 *  why size/colour are not applied here. */
export function applyFilters(items: ProductView[], f: ClothingFilters): ProductView[] {
  const narrowed = items.filter((p) => {
    if (f.dealsOnly && !isDeal(p)) return false;
    if (f.brands.length && !f.brands.includes(p.brandSlug)) return false;
    if (f.priceBands.length && !inSelectedBands(p.price, f.priceBands)) return false;
    return true;
  });
  return sortItems(narrowed, f.sort);
}

/** How many filters are set — the count on the "Filters" chip. Sort is not a
 *  filter and deals has its own chip, so neither is counted. */
export function countActive(f: ClothingFilters): number {
  return f.brands.length + f.sizes.length + f.colours.length + f.priceBands.length;
}

/** The removable chips shown under the filter row: one per active selection.
 *  `key` identifies which array + value to clear. */
export interface ActiveChip {
  key: string;
  label: string;
  clear: (f: ClothingFilters) => ClothingFilters;
}

export function activeChips(f: ClothingFilters, brandName: (slug: string) => string): ActiveChip[] {
  const chips: ActiveChip[] = [];
  for (const slug of f.brands)
    chips.push({
      key: `brand:${slug}`,
      label: brandName(slug),
      clear: (s) => ({ ...s, brands: s.brands.filter((x) => x !== slug) }),
    });
  for (const size of f.sizes)
    chips.push({
      key: `size:${size}`,
      label: `Size ${size}`,
      clear: (s) => ({ ...s, sizes: s.sizes.filter((x) => x !== size) }),
    });
  for (const colour of f.colours)
    chips.push({
      key: `colour:${colour}`,
      label: colour,
      clear: (s) => ({ ...s, colours: s.colours.filter((x) => x !== colour) }),
    });
  for (const band of f.priceBands)
    chips.push({
      key: `price:${band}`,
      label: band,
      clear: (s) => ({ ...s, priceBands: s.priceBands.filter((x) => x !== band) }),
    });
  if (f.dealsOnly)
    chips.push({ key: 'deals', label: 'Deals only', clear: (s) => ({ ...s, dealsOnly: false }) });
  return chips;
}

/**
 * The query the catalogue endpoint will accept once it filters clothing
 * server-side — the contract for the backend, and where size/colour become
 * real. CSV facets match the shape the design documents
 * (`?brand=nike,adidas&size=m&colour=black&sort=price_asc`).
 *
 * Not wired into the live request yet: the server ignores these fields today,
 * so sending them would split the react-query cache by a key the response does
 * not honour. Wire it into `catalogApi.products` + the query key in the same
 * change that teaches the server to read it.
 */
export function buildProductQuery(f: ClothingFilters): Record<string, string | undefined> {
  const csv = (xs: string[]) => (xs.length ? xs.join(',') : undefined);
  const band = PRICE_BANDS.filter((b) => f.priceBands.includes(b.label));
  return {
    brand: csv(f.brands),
    size: csv(f.sizes),
    colour: csv(f.colours),
    minPrice: band.length ? String(Math.min(...band.map((b) => b.min))) : undefined,
    maxPrice:
      band.length && band.every((b) => b.max !== null)
        ? String(Math.max(...band.map((b) => b.max as number)))
        : undefined,
    dealsOnly: f.dealsOnly ? 'true' : undefined,
    sort: f.sort === 'recommended' ? undefined : f.sort,
  };
}
