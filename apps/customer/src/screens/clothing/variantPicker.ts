import type { ProductVariantView } from '@haala/shared';

/**
 * The clothing PDP's size row × colour row, built from `variant.options`.
 *
 * A size is unavailable only when every colour in it is sold out; a colour is
 * judged within the chosen size. Unavailable chips stay visible — a shopper
 * should see that M exists, just not today.
 */
export interface Chip {
  value: string;
  available: boolean;
}

const sizeOf = (v: ProductVariantView) => v.options?.size;
const colorOf = (v: ProductVariantView) => v.options?.color;

/** Distinct values in variant order, which is the brand's own sort. */
const distinct = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))];

/** True when the size/colour rows can be built; otherwise use the flat label rail. */
export const hasOptions = (variants: ProductVariantView[]) => variants.some((v) => !!sizeOf(v));

export const sizeChips = (variants: ProductVariantView[]): Chip[] =>
  distinct(variants.map(sizeOf)).map((value) => ({
    value,
    available: variants.some((v) => sizeOf(v) === value && v.inStock),
  }));

export const colorChips = (variants: ProductVariantView[], size: string | undefined): Chip[] =>
  distinct(variants.map(colorOf)).map((value) => ({
    value,
    available: variants.some((v) => sizeOf(v) === size && colorOf(v) === value && v.inStock),
  }));

/** Keep the current colour if that combo is in stock, else the first one that is. */
export function pickSize(
  variants: ProductVariantView[],
  current: ProductVariantView | null,
  size: string,
): ProductVariantView | null {
  const inSize = variants.filter((v) => sizeOf(v) === size && v.inStock);
  return inSize.find((v) => colorOf(v) === (current && colorOf(current))) ?? inSize[0] ?? null;
}

export const pickColor = (
  variants: ProductVariantView[],
  current: ProductVariantView | null,
  color: string,
): ProductVariantView | null =>
  variants.find((v) => sizeOf(v) === (current && sizeOf(current)) && colorOf(v) === color && v.inStock) ??
  null;
