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

/** White surface, 8px radius, ambient ink shadow, 40px solid-Onyx add button. */
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
        <Thumb imageUrl={imageUrl} name={name} fill radius={theme.radii.sm} />
        {off > 0 ? (
          <View style={styles.badgeTL}>
            <DiscountBadge percent={off} />
          </View>
        ) : null}
        {onToggleFavorite ? (
          <IconButton
            name={favorite ? 'heart' : 'heart-outline'}
            size={15}
            dimension={30}
            color={favorite ? theme.colors.error : theme.colors.textSecondary}
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
      </View>

      <Text variant="bodyStrong" numberOfLines={2} style={styles.name}>
        {name}
      </Text>
      <Text variant="caption" color="textSecondary">
        {unit}
      </Text>

      <View style={styles.gridFooter}>
        <PriceText amount={price} original={original} variant="price" />
        <View style={styles.action}>
          {inStock ? (
            quantity > 0 ? (
              <QuantityStepper
                value={quantity}
                onChange={(next) => (next > quantity ? onIncrement?.() : onDecrement?.())}
                size="sm"
                loading={busy}
              />
            ) : (
              <IconButton
                name="add"
                variant="primary"
                size={20}
                dimension={36}
                onPress={onAdd}
                accessibilityLabel={`Add ${name} to cart`}
              />
            )
          ) : null}
        </View>
      </View>
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
        <Thumb imageUrl={imageUrl} name={name} fill radius={theme.radii.xs} />
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
      </View>

      <Text variant="labelSm" numberOfLines={2} style={styles.compactName}>
        {name}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {unit}
      </Text>

      <View style={styles.compactFooter}>
        <Text variant="bodyStrong" numberOfLines={1} style={styles.flexShrink}>
          {priceLabel(price)}
        </Text>
        {inStock ? (
          quantity > 0 ? (
            <QuantityStepper
              value={quantity}
              onChange={(next) => (next > quantity ? onIncrement?.() : onDecrement?.())}
              size="sm"
              loading={busy}
            />
          ) : (
            <IconButton
              name="add"
              variant="primary"
              size={18}
              dimension={30}
              onPress={onAdd}
              accessibilityLabel={`Add ${name} to cart`}
            />
          )
        ) : null}
      </View>
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

/** Compact cards have no room for a struck-through original, so price only. */
const priceLabel = (paisa: number): string =>
  `Rs. ${Math.round(paisa / 100).toLocaleString('en-PK')}`;

/** Fixed shelf-card width, matching the design's 132px rail rhythm. */
export const COMPACT_CARD_WIDTH = 132;

const styles = StyleSheet.create({
  // Grid
  grid: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    ...theme.elevation.card,
  },
  imageWrap: { width: '100%', marginBottom: theme.spacing.sm },
  badgeTL: { position: 'absolute', top: 4, left: 4 },
  heart: { position: 'absolute', top: 2, right: 2 },
  oosOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
    borderRadius: theme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { minHeight: 48 },
  gridFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  action: { minHeight: 36, justifyContent: 'center' },

  // Compact (shelf)
  compact: {
    width: COMPACT_CARD_WIDTH,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.sm,
    ...theme.elevation.card,
  },
  compactImage: {
    width: '100%',
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.xs,
  },
  oosOverlayCompact: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
    borderRadius: theme.radii.xs,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactName: { minHeight: 32 },
  compactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  flexShrink: { flexShrink: 1 },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.elevation.card,
  },
  rowInfo: { flex: 1, gap: 2 },
  rowPrice: { marginTop: theme.spacing.xs },
  rowAction: { justifyContent: 'center' },
});
