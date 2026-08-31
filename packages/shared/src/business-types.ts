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
 * The fields are written for the trade, not for the database. A Peshawar
 * boutique thinks in unstitched three-piece lawn suits, not in "attribute 1";
 * a home baker thinks in allergens and how many days it keeps. Getting that
 * vocabulary right is most of what makes the form fillable by someone who has
 * never used a dashboard before.
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

/**
 * How one attribute is captured.
 *
 * `tags` is a free list (ingredients, what's in the box). `select` is a closed
 * one — used wherever the answer belongs to a small fixed set, because a
 * vendor typing "unstiched" once makes the value unfilterable forever.
 */
export type AttributeKind = 'text' | 'textarea' | 'number' | 'tags' | 'boolean' | 'select';

export interface AttributeField {
  key: string;
  label: string;
  kind: AttributeKind;
  placeholder?: string;
  /** Shown after the input, e.g. "g" or "days". */
  suffix?: string;
  help?: string;
  /** Required for `select`. The only values the schema will accept. */
  options?: string[];
  /** Renders this field beside the previous one instead of below it. */
  half?: boolean;
}

/**
 * Type-specific wording for the fields *every* product has.
 *
 * A boutique calls it a suit title, a baker calls it what they baked. The
 * column is `products.name` either way — only the label on the form changes,
 * which costs nothing and is the difference between a form that reads as
 * yours and one that reads as software.
 */
export interface CoreLabels {
  name?: string;
  description?: string;
  unit?: string;
  /** What the picture is *of*, e.g. "Photos of the suit". */
  images?: string;
}

export interface BusinessTypeSpec {
  key: BusinessTypeKey;
  name: string;
  /**
   * The axes this type's variants vary along. Clothing sells the same suit in
   * a size *and* a colour; a bakery sells one cake in three sizes. These become
   * the keys of `product_variants.options`.
   */
  variantAxes: string[];
  /** The variant word shown in the UI: "Sizes", "Weights". */
  variantNoun: string;
  labels?: CoreLabels;
  fields: AttributeField[];
  /** Validates `products.attributes`. Strict: unknown keys are rejected. */
  schema: z.ZodType<Record<string, unknown>>;
}

const text = z.string().trim().max(400).optional();
const longText = z.string().trim().max(2000).optional();
const tags = z.array(z.string().trim().min(1).max(60)).max(40).optional();
const count = z.number().int().nonnegative().max(1_000_000).optional();
const flag = z.boolean().optional();
/** A closed list, so the stored value stays filterable. */
const oneOf = (values: string[]) => z.enum(values as [string, ...string[]]).optional();

// ── Values reused across types ──────────────────────────────────────────────
const STORAGE = ['Room temperature', 'Keep refrigerated', 'Keep frozen'];
const SUIT_TYPES = ['Unstitched', 'Semi-stitched', 'Stitched', 'Ready to wear'];
const PIECES = ['1 piece', '2 piece', '3 piece'];
const WEARER = ['Women', 'Men', 'Girls', 'Boys', 'Unisex'];

export const businessTypeSpecs: Record<BusinessTypeKey, BusinessTypeSpec> = {
  [BusinessTypeKey.Grocery]: {
    key: BusinessTypeKey.Grocery,
    name: 'Grocery',
    variantAxes: ['size'],
    variantNoun: 'Pack sizes',
    labels: { name: 'Product name', unit: 'Sold as', images: 'Photos' },
    fields: [
      { key: 'manufacturer', label: 'Brand / manufacturer', kind: 'text', placeholder: 'Nestlé', half: true },
      { key: 'countryOfOrigin', label: 'Made in', kind: 'text', placeholder: 'Pakistan', half: true },
      { key: 'storage', label: 'Storage', kind: 'select', options: STORAGE },
      { key: 'ingredients', label: 'Ingredients', kind: 'tags' },
    ],
    schema: z
      .object({
        manufacturer: text,
        countryOfOrigin: text,
        storage: oneOf(STORAGE),
        ingredients: tags,
      })
      .strict(),
  },

  [BusinessTypeKey.Bakery]: {
    key: BusinessTypeKey.Bakery,
    name: 'Bakery',
    variantAxes: ['size'],
    variantNoun: 'Sizes',
    labels: {
      name: 'What you baked',
      description: 'How you would describe it',
      unit: 'Sold as',
      images: 'Photos of the bake',
    },
    fields: [
      { key: 'weightGrams', label: 'Weight', kind: 'number', suffix: 'g', half: true },
      { key: 'servesPeople', label: 'Serves', kind: 'number', suffix: 'people', half: true },
      { key: 'flavour', label: 'Flavour', kind: 'text', placeholder: 'Dark chocolate' },
      {
        key: 'ingredients',
        label: 'Ingredients',
        kind: 'tags',
        help: 'Comma separated. Shown to customers who ask.',
      },
      {
        key: 'allergens',
        label: 'Allergens',
        kind: 'tags',
        help: 'Nuts, eggs, dairy, gluten. Worth being exact — people rely on this.',
      },
      { key: 'shelfLifeDays', label: 'Best within', kind: 'number', suffix: 'days', half: true },
      { key: 'storage', label: 'Storage', kind: 'select', options: STORAGE, half: true },
      { key: 'madeToOrder', label: 'Baked to order', kind: 'boolean' },
      {
        key: 'leadTimeHours',
        label: 'Notice needed',
        kind: 'number',
        suffix: 'hours',
        help: 'Only if baked to order.',
      },
    ],
    schema: z
      .object({
        weightGrams: count,
        servesPeople: count,
        flavour: text,
        ingredients: tags,
        allergens: tags,
        shelfLifeDays: count,
        storage: oneOf(STORAGE),
        madeToOrder: flag,
        leadTimeHours: count,
      })
      .strict(),
  },

  [BusinessTypeKey.Clothing]: {
    key: BusinessTypeKey.Clothing,
    name: 'Clothing',
    variantAxes: ['size', 'color'],
    variantNoun: 'Sizes and colours',
    labels: {
      name: 'Suit title',
      description: 'Suit description',
      unit: 'Sold as',
      images: 'Photos of the suit',
    },
    fields: [
      { key: 'suitType', label: 'Suit type', kind: 'select', options: SUIT_TYPES, half: true },
      { key: 'pieces', label: 'Pieces', kind: 'select', options: PIECES, half: true },
      { key: 'wearer', label: 'Made for', kind: 'select', options: WEARER, half: true },
      { key: 'fabric', label: 'Fabric', kind: 'text', placeholder: 'Lawn', half: true },
      {
        key: 'includes',
        label: 'What is included',
        kind: 'tags',
        placeholder: 'Shirt, Trouser, Dupatta',
        help: 'Comma separated.',
      },
      { key: 'work', label: 'Work / embroidery', kind: 'text', placeholder: 'Hand-embroidered neckline' },
      { key: 'collection', label: 'Collection', kind: 'text', placeholder: 'Eid ’26', half: true },
      { key: 'season', label: 'Season', kind: 'text', placeholder: 'Summer', half: true },
      { key: 'careInstructions', label: 'Care', kind: 'textarea', placeholder: 'Dry clean only' },
    ],
    schema: z
      .object({
        suitType: oneOf(SUIT_TYPES),
        pieces: oneOf(PIECES),
        wearer: oneOf(WEARER),
        fabric: text,
        includes: tags,
        work: text,
        collection: text,
        season: text,
        careInstructions: longText,
      })
      .strict(),
  },

  [BusinessTypeKey.FreshProduce]: {
    key: BusinessTypeKey.FreshProduce,
    name: 'Fresh fruit & vegetables',
    variantAxes: ['weight'],
    variantNoun: 'Weights',
    labels: { name: 'Produce name', unit: 'Sold by', images: 'Photos' },
    fields: [
      { key: 'origin', label: 'Grown in', kind: 'text', placeholder: 'Swat', half: true },
      { key: 'variety', label: 'Variety', kind: 'text', placeholder: 'Chaunsa', half: true },
      { key: 'grade', label: 'Grade', kind: 'select', options: ['A', 'B', 'Economy'], half: true },
      { key: 'shelfLifeDays', label: 'Keeps for', kind: 'number', suffix: 'days', half: true },
      { key: 'organic', label: 'Grown without chemical pesticides', kind: 'boolean' },
      { key: 'storage', label: 'Storage', kind: 'select', options: STORAGE },
    ],
    schema: z
      .object({
        origin: text,
        variety: text,
        grade: oneOf(['A', 'B', 'Economy']),
        shelfLifeDays: count,
        organic: flag,
        storage: oneOf(STORAGE),
      })
      .strict(),
  },

  [BusinessTypeKey.FrozenFood]: {
    key: BusinessTypeKey.FrozenFood,
    name: 'Frozen food',
    variantAxes: ['size'],
    variantNoun: 'Pack sizes',
    labels: { name: 'Product name', unit: 'Sold as', images: 'Photos' },
    fields: [
      { key: 'weightGrams', label: 'Weight', kind: 'number', suffix: 'g', half: true },
      { key: 'pieceCount', label: 'Pieces per pack', kind: 'number', suffix: 'pcs', half: true },
      { key: 'servings', label: 'Serves', kind: 'number', suffix: 'people', half: true },
      { key: 'shelfLifeDays', label: 'Keeps for', kind: 'number', suffix: 'days', half: true },
      { key: 'ingredients', label: 'Ingredients', kind: 'tags' },
      { key: 'allergens', label: 'Allergens', kind: 'tags' },
      { key: 'cookingInstructions', label: 'How to cook', kind: 'textarea' },
      { key: 'halal', label: 'Halal', kind: 'boolean' },
    ],
    schema: z
      .object({
        weightGrams: count,
        pieceCount: count,
        servings: count,
        shelfLifeDays: count,
        ingredients: tags,
        allergens: tags,
        cookingInstructions: longText,
        halal: flag,
      })
      .strict(),
  },

  [BusinessTypeKey.Gifts]: {
    key: BusinessTypeKey.Gifts,
    name: 'Gift items',
    variantAxes: ['variant'],
    variantNoun: 'Options',
    labels: { name: 'Gift name', unit: 'Sold as', images: 'Photos of the gift' },
    fields: [
      { key: 'occasions', label: 'Good for', kind: 'tags', placeholder: 'Eid, Birthday, Wedding' },
      { key: 'dimensions', label: 'Size', kind: 'text', placeholder: '20 × 15 × 8 cm', half: true },
      { key: 'material', label: 'Made of', kind: 'text', placeholder: 'Walnut wood', half: true },
      { key: 'includes', label: 'What is in it', kind: 'tags' },
      { key: 'personalisable', label: 'Can be personalised', kind: 'boolean' },
      {
        key: 'personalisationNote',
        label: 'What can be personalised',
        kind: 'text',
        placeholder: 'Name engraved on the lid',
      },
      { key: 'giftWrapped', label: 'Arrives gift wrapped', kind: 'boolean' },
      {
        key: 'leadTimeDays',
        label: 'Made to order in',
        kind: 'number',
        suffix: 'days',
        help: 'Leave blank if it ships from stock.',
      },
    ],
    schema: z
      .object({
        occasions: tags,
        dimensions: text,
        material: text,
        includes: tags,
        personalisable: flag,
        personalisationNote: text,
        giftWrapped: flag,
        leadTimeDays: count,
      })
      .strict(),
  },
};

/** Every key, in the order they should be offered. */
export const businessTypeKeys = Object.keys(businessTypeSpecs) as BusinessTypeKey[];

export const isBusinessTypeKey = (v: string): v is BusinessTypeKey =>
  Object.hasOwn(businessTypeSpecs, v);

/** The wording a type uses for the fields every product has. */
export function coreLabelsFor(typeKey: string): Required<CoreLabels> {
  const spec = isBusinessTypeKey(typeKey) ? businessTypeSpecs[typeKey] : null;
  return {
    name: spec?.labels?.name ?? 'Name',
    description: spec?.labels?.description ?? 'Description',
    unit: spec?.labels?.unit ?? 'Sold as',
    images: spec?.labels?.images ?? 'Photos',
  };
}

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
