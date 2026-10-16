import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ProductVariantView } from '@haala/shared';
import { colorChips, hasOptions, pickColor, pickSize, sizeChips } from './variantPicker';

/** Run: npx tsx --test apps/customer/src/screens/clothing/variantPicker.test.ts */

const v = (size: string, color: string, qty: number): ProductVariantView => ({
  id: `${size}/${color}`,
  label: `${size} / ${color}`,
  unit: '3-piece lawn suit',
  basePrice: 595000,
  price: 595000,
  compareAtPrice: null,
  availableQty: qty,
  inStock: qty > 0,
  options: { size, color },
});

const variants = [v('S', 'Rose', 2), v('S', 'Mint', 0), v('M', 'Rose', 0), v('M', 'Mint', 3), v('L', 'Rose', 0), v('L', 'Mint', 0)];

test('a size is unavailable only when every colour in it is sold out', () => {
  assert.deepEqual(sizeChips(variants), [
    { value: 'S', available: true },
    { value: 'M', available: true },
    { value: 'L', available: false },
  ]);
});

test('colours are judged within the chosen size', () => {
  assert.deepEqual(colorChips(variants, 'S'), [
    { value: 'Rose', available: true },
    { value: 'Mint', available: false },
  ]);
});

test('picking a size keeps the colour when that combo is in stock', () => {
  const twoInM = [...variants, v('M', 'Ivory', 1)];
  assert.equal(pickSize(twoInM, twoInM.find((x) => x.id === 'S/Rose')!, 'M')?.id, 'M/Mint');
  assert.equal(pickSize(twoInM, twoInM.find((x) => x.id === 'M/Ivory')!, 'M')?.id, 'M/Ivory');
});

test('picking a size moves to the first in-stock colour when the combo is sold out', () => {
  assert.equal(pickSize(variants, variants[0], 'M')?.id, 'M/Mint');
});

test('a sold-out size or colour picks nothing', () => {
  assert.equal(pickSize(variants, variants[0], 'L'), null);
  assert.equal(pickColor(variants, variants[0], 'Mint'), null);
});

test('variants without options fall back to the flat rail', () => {
  assert.equal(hasOptions(variants), true);
  assert.equal(hasOptions([{ ...variants[0], options: {} }]), false);
});
