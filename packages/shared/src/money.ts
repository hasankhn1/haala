/**
 * Money handling. All monetary amounts move through the system as INTEGER
 * minor units (paisa) to avoid floating-point drift — never as decimals.
 * Format only at the display edge.
 */

export const CURRENCY = 'PKR' as const;

/** Rupees → paisa. `rupees(12.4)` → 1240. */
export const rupees = (amount: number): number => Math.round(amount * 100);

/** Paisa → rupees (number). */
export const toRupees = (paisa: number): number => paisa / 100;

/**
 * Format paisa for display, e.g. 124000 → "PKR 1,240".
 * Whole rupees by default; pass `withDecimals` for exact amounts.
 */
export const formatPKR = (paisa: number, withDecimals = false): string => {
  const value = toRupees(paisa);
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: withDecimals ? 2 : 0,
    maximumFractionDigits: withDecimals ? 2 : 0,
  }).format(value);
  return `${CURRENCY} ${formatted}`;
};

export type Money = number; // paisa
