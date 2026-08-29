import { Pressable, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { Button } from './Button';
import { DiscountBadge, discountPercent } from './DiscountBadge';
import { IconButton } from './IconButton';
import { PriceText } from './PriceText';
import { QuantityStepper } from './QuantityStepper';
import { Text } from './Text';
import { Thumb } from './Thumb';

export type ProductCardVariant = 'grid' | 'row' | 'compact';

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
   * `grid` (default) — 2-column listing card.
   * `row` — horizontal card for the cart.
   * `compact` — the narrow card used in Home's horizontally-scrolling category
   * shelves (fixed 132px wide).
   */
  variant?: ProductCardVariant;
  favorite?: boolean;
  onToggleFavorite?: () => void;
}

export function ProductCard(props: ProductCardProps) {
  if (props.variant === 'row') return <RowCard {...props} />;
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

/** Narrow shelf card — Home's "Milk & Dairy" / "Fresh Bread" rails. */
function CompactCard({
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
  const off = discountPercent(price, original);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compact, pressed && onPress ? { opacity: 0.92 } : null]}
    >
      <View style={styles.compactImage}>
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

/** Fixed shelf-card width, matching the design's 146px rail rhythm. */
export const COMPACT_CARD_WIDTH = 146;

const styles = StyleSheet.create({
  // Grid — no surface; the photo is the card.
  grid: { gap: theme.spacing.sm },
  imageWrap: {
    width: '100%',
    aspectRatio: 1,
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
  compact: { width: COMPACT_CARD_WIDTH, gap: theme.spacing.sm },
  compactImage: {
    width: '100%',
    height: COMPACT_CARD_WIDTH,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.surfaceSunken,
    overflow: 'hidden',
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
