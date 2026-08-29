import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Button } from './Button';
import { DiscountBadge, discountPercent } from './DiscountBadge';
import { IconButton } from './IconButton';
import { PriceText } from './PriceText';
import { QuantityStepper } from './QuantityStepper';
import { Text } from './Text';
import { Thumb } from './Thumb';

export type ProductCardVariant = 'grid' | 'row' | 'compact' | 'mini' | 'upsell';

export interface ProductCardProps {
  name: string;
  unit: string;
  price: number;
  original?: number;
  imageUrl?: string | null;
  inStock?: boolean;
  /** Quantity currently in the cart; when > 0 a stepper replaces the Add button. */
  quantity?: number;
  onAdd: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  onPress?: () => void;
  busy?: boolean;
  /**
   * The comps use four distinct tile sizes and they are not interchangeable:
   *
   * - `grid` (default) — 2-column listing, 150px image block.
   * - `compact` — Home's shelf rails, 146px square.
   * - `mini` — the PDP's "more in this aisle" rail, 120px square.
   * - `upsell` — the cart's "Forgot something?" rail: 108px on an ember wash
   *   with a filled Add button instead of the floating circle.
   * - `row` — the cart line item.
   */
  variant?: ProductCardVariant;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

export function ProductCard(props: ProductCardProps) {
  if (props.variant === 'row') return <RowCard {...props} />;
  if (props.variant === 'upsell') return <UpsellCard {...props} />;
  if (props.variant === 'mini') return <CompactCard {...props} size={MINI_CARD_WIDTH} />;
  if (props.variant === 'compact') return <CompactCard {...props} />;
  return <GridCard {...props} />;
}

/**
 * Basket's product card: no white surface at all. The photo is the card — a
 * 16px-radius block on clay — with the saving badge pinned top-left and the
 * add control floating over the bottom-right corner. Name, unit and price sit
 * directly on the beige canvas underneath.
 *
 * Dropping the white panel is what lets a two-column grid breathe on a warm
 * background; the old card needed its own surface to separate from near-white.
 */
function GridCard({
  name,
  unit,
  price,
  original,
  imageUrl,
  inStock = true,
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
  busy = false,
  favorite,
  onToggleFavorite,
}: ProductCardProps) {
  const off = discountPercent(price, original);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.grid, pressed && onPress ? { opacity: 0.92 } : null]}
    >
      <View style={styles.imageWrap}>
        <Thumb imageUrl={imageUrl} name={name} fill radius={theme.radii.md} />
        {off > 0 ? (
          <View style={styles.badgeTL}>
            <DiscountBadge percent={off} />
          </View>
        ) : null}
        {onToggleFavorite ? (
          <IconButton
            name="heart"
            size={15}
            dimension={30}
            color={favorite ? theme.colors.error : theme.colors.textSecondary}
            fill={favorite ? theme.colors.error : 'none'}
            onPress={onToggleFavorite}
            accessibilityLabel="Toggle favorite"
            style={styles.heart}
          />
        ) : null}
        {!inStock ? (
          <View style={styles.oosOverlay}>
            <Text variant="labelSm" color="onPrimary">
              Out of stock
            </Text>
          </View>
        ) : null}
        {/* The add control floats on the photo rather than sitting in a footer
            row — it keeps the text block below to pure information. */}
        {inStock ? (
          <View style={styles.actionFloat}>
            {quantity > 0 ? (
              <QuantityStepper
                value={quantity}
                onChange={(next) => (next > quantity ? onIncrement?.() : onDecrement?.())}
                size="sm"
                loading={busy}
              />
            ) : (
              <IconButton
                name="add"
                size={19}
                dimension={34}
                color={theme.colors.primary}
                onPress={onAdd}
                loading={busy}
                accessibilityLabel={`Add ${name} to cart`}
              />
            )}
          </View>
        ) : null}
      </View>

      <Text variant="bodySm" numberOfLines={2} style={styles.name}>
        {name}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {unit}
      </Text>
      <PriceText amount={price} original={original} variant="price" />
    </Pressable>
  );
}

/**
 * Narrow shelf card. Sized by the caller: 146px on Home's rails, 120px on the
 * PDP's "more in this aisle" — the comps use both and the smaller one drops to
 * a tighter name and price.
 */
function CompactCard({
  name,
  price,
  original,
  imageUrl,
  inStock = true,
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
  busy = false,
  size = COMPACT_CARD_WIDTH,
}: ProductCardProps & { size?: number }) {
  const off = discountPercent(price, original);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.compact,
        { width: size },
        pressed && onPress ? { opacity: 0.92 } : null,
      ]}
    >
      <View style={[styles.compactImage, { height: size }]}>
        <Thumb imageUrl={imageUrl} name={name} fill radius={theme.radii.md} />
        {off > 0 ? (
          <View style={styles.badgeTL}>
            <DiscountBadge percent={off} />
          </View>
        ) : null}
        {!inStock ? (
          <View style={styles.oosOverlayCompact}>
            <Text variant="caption" color="onPrimary">
              Out of stock
            </Text>
          </View>
        ) : null}
        {inStock ? (
          <View style={styles.actionFloat}>
            {quantity > 0 ? (
              <QuantityStepper
                value={quantity}
                onChange={(next) => (next > quantity ? onIncrement?.() : onDecrement?.())}
                size="sm"
                loading={busy}
              />
            ) : (
              <IconButton
                name="add"
                size={17}
                dimension={34}
                color={theme.colors.primary}
                onPress={onAdd}
                loading={busy}
                accessibilityLabel={`Add ${name} to cart`}
              />
            )}
          </View>
        ) : null}
      </View>

      <Text variant="bodySm" numberOfLines={2} style={styles.compactName}>
        {name}
      </Text>
      <PriceText amount={price} original={original} variant="price" />
    </Pressable>
  );
}

/**
 * The cart's "Forgot something?" tile. Unlike every other card this one sits on
 * an ember wash with its photo in a white well, and its Add is a filled button
 * rather than the floating circle — it is an interruption, so the comps let it
 * look like one.
 */
function UpsellCard({ name, price, imageUrl, onAdd, onPress, busy = false }: ProductCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.upsell, pressed && onPress ? { opacity: 0.92 } : null]}
    >
      <View style={styles.upsellImage}>
        <Thumb imageUrl={imageUrl} name={name} fill radius={theme.radii.xs} />
      </View>
      <Text variant="caption" color="textSecondary" numberOfLines={1} style={styles.upsellName}>
        {name}
      </Text>
      <Text variant="label">{priceLabel(price)}</Text>
      <Pressable
        onPress={onAdd}
        disabled={busy}
        style={({ pressed }) => [styles.upsellAdd, pressed && { opacity: 0.85 }]}
        accessibilityRole="button"
        accessibilityLabel={`Add ${name} to cart`}
      >
        <Text variant="labelSm" color="onPrimary">
          Add
        </Text>
      </Pressable>
    </Pressable>
  );
}

function RowCard({
  name,
  unit,
  price,
  original,
  imageUrl,
  inStock = true,
  quantity = 0,
  onAdd,
  onIncrement,
  onDecrement,
  onPress,
  busy = false,
}: ProductCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && onPress ? { opacity: 0.9 } : null]}
    >
      <Thumb imageUrl={imageUrl} name={name} size={64} radius={theme.radii.sm} />
      <View style={styles.rowInfo}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {name}
        </Text>
        <Text variant="caption" color="textSecondary">
          {unit}
        </Text>
        <View style={styles.rowPrice}>
          <PriceText amount={price} original={original} variant="price" />
        </View>
      </View>
      <View style={styles.rowAction}>
        {!inStock ? (
          <Text variant="caption" color="error">
            Out of stock
          </Text>
        ) : quantity > 0 ? (
          <QuantityStepper
            value={quantity}
            onChange={(next) => (next > quantity ? onIncrement?.() : onDecrement?.())}
            size="sm"
            loading={busy}
          />
        ) : (
          <Button label="Add" size="sm" fullWidth={false} onPress={onAdd} loading={busy} />
        )}
      </View>
    </Pressable>
  );
}

/** Home's shelf rails. Narrower than the comp's 146 so more of the shelf is
 *  visible at once — the rail is for browsing, not for reading. */
export const COMPACT_CARD_WIDTH = 126;
/** The PDP's "more in this aisle" rail — the comps use a smaller tile there. */
export const MINI_CARD_WIDTH = 120;
/** The cart's "Forgot something?" rail. */
export const UPSELL_CARD_WIDTH = 108;

/** Compact tiles have no room for a struck-through original, so price only. */
const priceLabel = (paisa: number): string =>
  `Rs. ${Math.round(paisa / 100).toLocaleString('en-PK')}`;

const styles = StyleSheet.create({
  // Grid — no surface; the photo is the card.
  grid: { gap: theme.spacing.sm },
  imageWrap: {
    width: '100%',
    height: 150,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSunken,
    overflow: 'hidden',
  },
  /** Floating add control, over the photo's bottom-right corner. */
  actionFloat: { position: 'absolute', right: 8, bottom: 8 },
  badgeTL: { position: 'absolute', top: 4, left: 4 },
  heart: { position: 'absolute', top: 2, right: 2 },
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
    borderRadius: theme.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { minHeight: 36 },

  // Compact (shelf)
  compact: { gap: theme.spacing.sm },
  compactImage: {
    width: '100%',
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSunken,
    overflow: 'hidden',
  },

  // Upsell (cart rail)
  upsell: {
    width: UPSELL_CARD_WIDTH,
    backgroundColor: theme.colors.infoSoft,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    gap: 6,
  },
  upsellImage: {
    height: 70,
    borderRadius: theme.radii.xs,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  upsellName: { marginTop: 1 },
  upsellAdd: {
    marginTop: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: 9,
    paddingVertical: 6,
    alignItems: 'center',
  },
  oosOverlayCompact: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
    borderRadius: theme.radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactName: { minHeight: 34 },

  // Row — the cart line. No panel: a sunken thumb well plus a hairline rule
  // is what separates one line from the next on a white canvas.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowPrice: { marginTop: theme.spacing.xs },
  rowAction: { justifyContent: 'center' },
});
