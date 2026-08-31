import { z } from 'zod';

/**
 * What each kind of business needs on a product, beyond the fields every
 * product has.
 *
 * The database stores these in `products.attributes` as jsonb, which is
 * deliberately loose at rest and strict at the boundary: this registry is the
 * single definition of what a type's attributes *are*, and both sides use it —
 * the API validates writes against `schema`, and the dashboard renders its form
 * from `fields`. Neither reimplements the other.
 *
 * Adding a business type is one entry here plus one `business_types` row. That
 * needs a deploy, which is the deliberate trade for the product form being
 * type-checked rather than a JSON blob interpreted at runtime — a form that
 * sets prices is not somewhere to discover a typo in production.
 */
export const BusinessTypeKey = {
  Grocery: 'grocery',
  Bakery: 'bakery',
  Clothing: 'clothing',
  FreshProduce: 'fresh_produce',
  FrozenFood: 'frozen_food',
  Gifts: 'gifts',
} as const;
export type BusinessTypeKey = (typeof BusinessTypeKey)[keyof typeof BusinessTypeKey];

/** How one attribute is captured. `tags` is a free list, e.g. ingredients. */
export type AttributeKind = 'text' | 'textarea' | 'number' | 'tags' | 'boolean';

export interface AttributeField {
  key: string;
  label: string;
  kind: AttributeKind;
  placeholder?: string;
  /** Shown after the input, e.g. "g" or "days". */
  suffix?: string;
  help?: string;
}

export interface BusinessTypeSpec {
  key: BusinessTypeKey;
  name: string;
  /**
   * The axes this type's variants vary along. Clothing sells the same shirt in
   * a size *and* a colour; a bakery sells one cake in three sizes. These become
   * the keys of `product_variants.options`.
   */
  variantAxes: string[];
  /** The variant word shown in the UI: "Sizes", "Weights". */
  variantNoun: string;
  fields: AttributeField[];
  /** Validates `products.attributes`. Strict: unknown keys are rejected. */
  schema: z.ZodType<Record<string, unknown>>;
}

const optionalText = z.string().trim().max(2000).optional();
const optionalTags = z.array(z.string().trim().min(1).max(60)).max(40).optional();
const optionalCount = z.number().int().nonnegative().max(1_000_000).optional();

export const businessTypeSpecs: Record<BusinessTypeKey, BusinessTypeSpec> = {
  [BusinessTypeKey.Grocery]: {
    key: BusinessTypeKey.Grocery,
    name: 'Grocery',
    variantAxes: ['size'],
    variantNoun: 'Sizes',
    fields: [
      { key: 'brandName', label: 'Manufacturer', kind: 'text', placeholder: 'Nestlé' },
      { key: 'storage', label: 'Storage', kind: 'text', placeholder: 'Cool, dry place' },
    ],
    schema: z.object({ brandName: optionalText, storage: optionalText }).strict(),
  },

  [BusinessTypeKey.Bakery]: {
    key: BusinessTypeKey.Bakery,
    name: 'Bakery',
    variantAxes: ['size'],
    variantNoun: 'Sizes',
    fields: [
      { key: 'weightGrams', label: 'Weight', kind: 'number', suffix: 'g' },
      {
        key: 'ingredients',
        label: 'Ingredients',
        kind: 'tags',
        help: 'Shown to customers with allergies.',
      },
      { key: 'shelfLifeDays', label: 'Best within', kind: 'number', suffix: 'days' },
      { key: 'containsAllergens', label: 'Contains nuts, eggs or dairy', kind: 'boolean' },
    ],
    schema: z
      .object({
        weightGrams: optionalCount,
        ingredients: optionalTags,
        shelfLifeDays: optionalCount,
        containsAllergens: z.boolean().optional(),
      })
      .strict(),
  },

  [BusinessTypeKey.Clothing]: {
    key: BusinessTypeKey.Clothing,
    name: 'Clothing',
    variantAxes: ['size', 'color'],
    variantNoun: 'Sizes and colours',
    fields: [
      { key: 'material', label: 'Fabric', kind: 'text', placeholder: 'Lawn cotton' },
      { key: 'careInstructions', label: 'Care', kind: 'textarea', placeholder: 'Hand wash cold' },
      { key: 'pieceCount', label: 'Pieces in the set', kind: 'number', suffix: 'pcs' },
      { key: 'stitched', label: 'Sold stitched', kind: 'boolean' },
    ],
    schema: z
      .object({
        material: optionalText,
        careInstructions: optionalText,
        pieceCount: optionalCount,
        stitched: z.boolean().optional(),
      })
      .strict(),
  },

  [BusinessTypeKey.FreshProduce]: {
    key: BusinessTypeKey.FreshProduce,
    name: 'Fresh fruit & vegetables',
    variantAxes: ['weight'],
    variantNoun: 'Weights',
    fields: [
      { key: 'origin', label: 'Grown in', kind: 'text', placeholder: 'Swat' },
      { key: 'organic', label: 'Organic', kind: 'boolean' },
      { key: 'shelfLifeDays', label: 'Keeps for', kind: 'number', suffix: 'days' },
    ],
    schema: z
      .object({
        origin: optionalText,
        organic: z.boolean().optional(),
        shelfLifeDays: optionalCount,
      })
      .strict(),
  },

  [BusinessTypeKey.FrozenFood]: {
    key: BusinessTypeKey.FrozenFood,
    name: 'Frozen food',
    variantAxes: ['size'],
    variantNoun: 'Pack sizes',
    fields: [
      { key: 'weightGrams', label: 'Weight', kind: 'number', suffix: 'g' },
      { key: 'ingredients', label: 'Ingredients', kind: 'tags' },
      { key: 'cookingInstructions', label: 'How to cook', kind: 'textarea' },
      { key: 'servings', label: 'Serves', kind: 'number', suffix: 'people' },
    ],
    schema: z
      .object({
        weightGrams: optionalCount,
        ingredients: optionalTags,
        cookingInstructions: optionalText,
        servings: optionalCount,
      })
      .strict(),
  },

  [BusinessTypeKey.Gifts]: {
    key: BusinessTypeKey.Gifts,
    name: 'Gift items',
    variantAxes: ['variant'],
    variantNoun: 'Options',
    fields: [
      { key: 'dimensions', label: 'Size', kind: 'text', placeholder: '20 × 15 × 8 cm' },
      { key: 'personalisable', label: 'Can be personalised', kind: 'boolean' },
      { key: 'leadTimeDays', label: 'Made to order in', kind: 'number', suffix: 'days' },
      { key: 'includes', label: 'What is included', kind: 'tags' },
    ],
    schema: z
      .object({
        dimensions: optionalText,
        personalisable: z.boolean().optional(),
        leadTimeDays: optionalCount,
        includes: optionalTags,
      })
      .strict(),
  },
};

/** Every key, in the order they should be offered. */
export const businessTypeKeys = Object.keys(businessTypeSpecs) as BusinessTypeKey[];

export const isBusinessTypeKey = (v: string): v is BusinessTypeKey =>
  Object.hasOwn(businessTypeSpecs, v);

/**
 * Validate a product's attributes for a given business type.
 *
 * Unknown types fail closed — a brand whose type has no spec cannot write
 * arbitrary attributes, which is the safe direction when a `business_types` row
 * has been added but its registry entry has not shipped yet.
 */
export function parseAttributes(
  typeKey: string,
  value: unknown,
): { ok: true; data: Record<string, unknown> } | { ok: false; message: string } {
  if (!isBusinessTypeKey(typeKey)) {
    return { ok: false, message: `Unknown business type "${typeKey}"` };
  }
  const parsed = businessTypeSpecs[typeKey].schema.safeParse(value ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') || 'attributes';
    return { ok: false, message: `${where}: ${first?.message ?? 'is invalid'}` };
  }
  return { ok: true, data: parsed.data };
}
