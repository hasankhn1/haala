import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatPKR, type ProductVariantView, type ProductView } from '@haala/shared';
import {
  BottomSheet,
  Button,
  Icon,
  IconButton,
  ProductCard,
  QuantityStepper,
  remoteImageSource,
  Text,
  theme,
} from '@haala/ui';
import { catalogApi } from '../../api/endpoints';
import { qk } from '../../api/queryKeys';
import { ETA_MINUTES } from '../../config';
import { useProductActions } from '../../hooks/useProductActions';
import { colorChips, hasOptions, pickColor, pickSize, sizeChips, type Chip } from './variantPicker';

/**
 * The clothing product page — `Haala PDP.dc.html`. Brand-forward and
 * editorial: a tall garment photo, the brand above the name, and a size row ×
 * colour row in place of one card per combination, which at 7 sizes × 5
 * colours was a wall of 35.
 *
 * Grocery keeps its own page in `app/product/[id].tsx`.
 */

/** Past this many flat chips the fallback rail gets a "See all" sheet. */
const FLAT_RAIL_LIMIT = 8;
const LOW_STOCK = 5;

export function ClothingProductScreen({ product: p, storeId }: { product: ProductView; storeId: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { cart, qtyByProduct, busy, busyVariantId, addProduct, addVariant, setQty } =
    useProductActions(storeId);

  const related = useQuery({
    queryKey: qk.products(storeId, p.categoryId),
    queryFn: () => catalogApi.products({ storeId, categoryId: p.categoryId }),
  });
  const aisle = (related.data?.items ?? []).filter((r) => r.id !== p.id).slice(0, 8);
  const sameBrand = aisle.filter((r) => r.brandSlug === p.brandSlug);
  const rail = sameBrand.length > 0 ? sameBrand : aisle;

  const variants = p.variants ?? [];
  const soldOut = !variants.some((v) => v.inStock);
  // Opens on the first combination this store can actually sell.
  const [variantId, setVariantId] = useState<string | null>(null);
  const selected =
    variants.find((v) => v.id === variantId) ?? variants.find((v) => v.inStock) ?? variants[0] ?? null;
  const [pending, setPending] = useState(1);
  const choose = (v: ProductVariantView | null) => {
    if (!v) return;
    setVariantId(v.id);
    setPending(1);
  };

  const inCartQty = selected ? (qtyByProduct.get(selected.id) ?? 0) : 0;
  const shownQty = inCartQty > 0 ? inCartQty : pending;
  const max = selected?.availableQty ?? 0;
  const price = selected?.price ?? p.price;
  // The size's own "was" price from the brand; failing that, its catalogue
  // price, which a store override can undercut. `p.basePrice` already follows
  // the card's size, so it only stands in when there is no size at all.
  const basePrice = selected ? (selected.compareAtPrice ?? selected.basePrice) : p.basePrice;
  const cartCount = (cart.data?.baskets ?? []).reduce((n, b) => n + b.itemCount, 0);

  const images = p.images?.length ? p.images : p.imageUrl ? [p.imageUrl] : [];
  const [slide, setSlide] = useState(0);
  const chips = [p.attributes?.pieces, p.attributes?.fabric].filter(
    (a): a is string => typeof a === 'string' && a.length > 0,
  );

  const note =
    max > 0 && shownQty >= max
      ? `That's all ${max} we have in this option`
      : inCartQty > 0
        ? 'In your clothing basket · checks out separately from grocery'
        : null;

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        <View style={[styles.hero, { height: images.length ? 500 : 300 }]}>
          {images.length > 1 ? (
            <FlatList
              horizontal
              pagingEnabled
              data={images}
              keyExtractor={(u, i) => `${i}:${u}`}
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                const i = Math.round(e.nativeEvent.contentOffset.x / width);
                if (i !== slide) setSlide(i);
              }}
              renderItem={({ item }) => (
                <Image source={remoteImageSource(item)} style={{ width, height: '100%' }} resizeMode="cover" />
              )}
            />
          ) : images.length === 1 ? (
            <Image source={remoteImageSource(images[0])} style={styles.fill} resizeMode="cover" />
          ) : (
            <View style={[styles.fill, styles.noImage]}>
              <View style={styles.noImageDisc}>
                <Icon name="bag-handle-outline" size={34} color={theme.colors.textTertiary} />
              </View>
            </View>
          )}
          {soldOut ? <View style={styles.soldOutWash} pointerEvents="none" /> : null}

          <View style={styles.badges} pointerEvents="none">
            <View style={[styles.badge, soldOut ? styles.badgeDark : styles.badgeLight]}>
              <Text variant="labelSm" color={soldOut ? 'textInverse' : 'textPrimary'}>
                {soldOut ? 'OUT OF STOCK' : 'IN STOCK'}
              </Text>
            </View>
           
          </View>
          {images.length > 1 ? (
            <View style={styles.counter} pointerEvents="none">
              <Text variant="labelSm" color="textInverse">
                {slide + 1} / {images.length}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <Pressable
            style={styles.brandRow}
            onPress={() => router.push('/brands?department=clothing')}
            accessibilityRole="link"
          >
            <Text variant="labelCaps" color="info">
              {p.brandName}
            </Text>
            <Icon name="chevron-forward" size={11} color={theme.colors.info} />
          </Pressable>
          <Text variant="h1" style={styles.title}>
            {p.name}
          </Text>
          <View style={styles.subRow}>
            <Text variant="bodySm" color="textSecondary">
              {p.unit}
            </Text>
            {chips.map((c) => (
              <View key={c} style={styles.attrChip}>
                <Text variant="labelSm">{c}</Text>
              </View>
            ))}
          </View>

          <View style={styles.priceRow}>
            <View>
              <View style={styles.priceLine}>
                <Text variant="h1" color={soldOut ? 'textTertiary' : 'textPrimary'} style={styles.price}>
                  {formatPKR(price)}
                </Text>
                {basePrice > price ? (
                  <Text variant="caption" color="textTertiary" style={styles.strike}>
                    {formatPKR(basePrice)}
                  </Text>
                ) : null}
              </View>
              {basePrice > price ? (
                <View style={styles.saveChip}>
                  <Text variant="labelSm" color="onPromo">
                    You save {formatPKR(basePrice - price)}
                  </Text>
                </View>
              ) : null}
            </View>
            <StockText qty={selected?.availableQty ?? 0} />
          </View>

          {soldOut ? (
            <View style={styles.soldOutNote}>
              <Text variant="bodySm" color="textSecondary">
                Every size and colour is sold out at the moment. More from the brand is below.
              </Text>
            </View>
          ) : null}

          {variants.length > 1 ? (
            hasOptions(variants) ? (
              <OptionPicker variants={variants} selected={selected} onPick={choose} />
            ) : (
              <FlatPicker variants={variants} selected={selected} onPick={choose} />
            )
          ) : null}

          {p.description ? (
            <View style={styles.block}>
              <Text variant="h3">Details</Text>
              <Text variant="body" color="accent">
                {p.description}
              </Text>
            </View>
          ) : null}

          {rail.length > 0 ? (
            <View style={styles.railBlock}>
              <Text variant="h3">{sameBrand.length > 0 ? `More from ${p.brandName}` : 'More in this aisle'}</Text>
              <FlatList
                horizontal
                data={rail}
                keyExtractor={(r) => r.id}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railRow}
                renderItem={({ item }) => {
                  const vid = item.defaultVariantId ?? '';
                  const q = qtyByProduct.get(vid) ?? 0;
                  return (
                    <View style={styles.railCard}>
                      <ProductCard
                        variant="grid"
                        imageHeight={186}
                        name={item.name}
                        unit={item.unit}
                        price={item.price}
                        original={item.basePrice}
                        imageUrl={item.imageUrl}
                        inStock={item.inStock}
                        quantity={q}
                        busy={busyVariantId === item.defaultVariantId}
                        onPress={() => router.push(`/product/${item.id}`)}
                        onAdd={() => addProduct(item)}
                        onIncrement={() => setQty(vid, q + 1)}
                        onDecrement={() => setQty(vid, q - 1)}
                      />
                    </View>
                  );
                }}
              />
            </View>
          ) : null}
        </View>
      </ScrollView>

      <SafeAreaView style={styles.header} edges={['top', 'left', 'right']} pointerEvents="box-none">
        <IconButton name="arrow-back" onPress={() => router.back()} accessibilityLabel="Back" />
        <View>
          <IconButton
            name="cart-outline"
            onPress={() => router.push('/(tabs)/cart?department=clothing')}
            accessibilityLabel="Your cart"
          />
          {cartCount > 0 ? (
            <View style={styles.cartBadge} pointerEvents="none">
              <Text variant="labelSm" color="onPrimary">
                {cartCount}
              </Text>
            </View>
          ) : null}
        </View>
      </SafeAreaView>

      {selected?.inStock ? (
        <SafeAreaView style={styles.bar} edges={['bottom', 'left', 'right']}>
          {note ? (
            <Text variant="caption" color="textSecondary" align="center">
              {note}
            </Text>
          ) : null}
          <View style={styles.barRow}>
            <QuantityStepper
              value={shownQty}
              onChange={(next) => (inCartQty > 0 ? setQty(selected.id, next) : setPending(next))}
              min={inCartQty > 0 ? 0 : 1}
              max={Math.max(max, 1)}
              loading={busy}
            />
            <View style={styles.flex}>
              {inCartQty > 0 ? (
                <Button
                  label={`Added to cart  ·  ${formatPKR(price * inCartQty)}`}
                  onPress={() => router.push('/(tabs)/cart?department=clothing')}
                  loading={busy}
                  style={styles.addedCta}
                  leadingIcon={<Icon name="checkmark-circle" size={18} color={theme.colors.onPrimary} />}
                />
              ) : (
                <Button
                  label={`Add  ·  ${formatPKR(price * pending)}`}
                  onPress={() => addVariant(p, selected, pending)}
                  loading={busy}
                />
              )}
            </View>
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

function StockText({ qty }: { qty: number }) {
  if (qty <= 0)
    return (
      <Text variant="label" color="textTertiary">
        Sold out
      </Text>
    );
  return (
    <Text variant="label" color={qty <= LOW_STOCK ? 'info' : 'textPrimary'}>
      {qty <= LOW_STOCK ? `Only ${qty} left` : `In stock · ${qty} left`}
    </Text>
  );
}

interface PickerProps {
  variants: ProductVariantView[];
  selected: ProductVariantView | null;
  onPick: (v: ProductVariantView | null) => void;
}

/** Size row, then colour row scoped to that size. Needs `variant.options`. */
function OptionPicker({ variants, selected, onPick }: PickerProps) {
  const size = selected?.options?.size;
  const colors = colorChips(variants, size);
  return (
    <View style={styles.picker}>
      <PickerHeading title="Size" value={size} />
      <View style={styles.chipRow}>
        {sizeChips(variants).map((c) => (
          <OptionChip
            key={c.value}
            chip={c}
            on={c.value === size}
            shape="box"
            onPress={() => onPick(pickSize(variants, selected, c.value))}
          />
        ))}
      </View>
      {colors.length > 0 ? (
        <>
          <PickerHeading title="Colour" value={selected?.options?.color} spaced />
          <View style={styles.chipRow}>
            {colors.map((c) => (
              <OptionChip
                key={c.value}
                chip={c}
                on={c.value === selected?.options?.color}
                shape="pill"
                onPress={() => onPick(pickColor(variants, selected, c.value))}
              />
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}

/**
 * Variants saved before sizes and colours were structured carry only a
 * combined label, so they get one scrolling rail of labels instead.
 */
function FlatPicker({ variants, selected, onPick }: PickerProps) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.picker}>
      <PickerHeading title="Size / Colour" value={selected?.label} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.flatRow}>
        {variants.map((v) => (
          <OptionChip
            key={v.id}
            chip={{ value: v.label, available: v.inStock }}
            on={v.id === selected?.id}
            shape="box"
            onPress={() => onPick(v)}
          />
        ))}
      </ScrollView>
      {variants.length > FLAT_RAIL_LIMIT ? (
        <Pressable style={styles.seeAll} onPress={() => setOpen(true)} accessibilityRole="button">
          <Text variant="label">See all {variants.length} options</Text>
          <Icon name="chevron-down" size={12} color={theme.colors.textPrimary} />
        </Pressable>
      ) : null}
      <BottomSheet visible={open} onClose={() => setOpen(false)} title="Choose size / colour">
        {variants.map((v) => {
          const on = v.id === selected?.id;
          return (
            <Pressable
              key={v.id}
              disabled={!v.inStock}
              onPress={() => {
                onPick(v);
                setOpen(false);
              }}
              style={styles.sheetRow}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: !v.inStock }}
              accessibilityLabel={`${v.label}${on ? ', selected' : ''}${v.inStock ? '' : ', out of stock'}`}
            >
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              <Text
                variant="bodyStrong"
                color={v.inStock ? 'textPrimary' : 'textDisabled'}
                style={[styles.flex, !v.inStock && styles.strike]}
              >
                {v.label}
              </Text>
              {!v.inStock || v.availableQty <= LOW_STOCK ? (
                <Text variant="caption" color={v.inStock ? 'info' : 'textTertiary'}>
                  {v.inStock ? `Only ${v.availableQty} left` : 'Out of stock'}
                </Text>
              ) : null}
              <Text variant="bodyStrong" color={v.inStock ? 'textPrimary' : 'textDisabled'} style={styles.sheetPrice}>
                {formatPKR(v.price)}
              </Text>
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

function PickerHeading({ title, value, spaced }: { title: string; value?: string; spaced?: boolean }) {
  return (
    <View style={[styles.pickerHeading, spaced && styles.pickerHeadingSpaced]}>
      <Text variant="title">{title}</Text>
      {value ? (
        <Text variant="bodySm" color="textSecondary">
          {value}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Sold-out stays on screen — dashed, struck through and inert — so a shopper
 * can see the size exists rather than wonder whether it was ever made.
 */
function OptionChip({
  chip,
  on,
  shape,
  onPress,
}: {
  chip: Chip;
  on: boolean;
  shape: 'box' | 'pill';
  onPress: () => void;
}) {
  const off = !chip.available;
  return (
    <Pressable
      disabled={off}
      onPress={onPress}
      style={[
        styles.chip,
        shape === 'pill' ? styles.chipPill : styles.chipBox,
        off ? styles.chipOff : null,
        on ? (off ? styles.chipOnOff : styles.chipOn) : null,
      ]}
      accessibilityRole="radio"
      accessibilityState={{ selected: on, disabled: off }}
      // RN Web drops accessibilityState, so the label carries it too.
      accessibilityLabel={`${chip.value}${on ? ', selected' : ''}${off ? ', out of stock' : ''}`}
    >
      <Text
        variant="label"
        color={on ? (off ? 'textTertiary' : 'textInverse') : off ? 'textDisabled' : 'textPrimary'}
        style={off ? styles.strike : null}
      >
        {chip.value}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  flex: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  scroll: { paddingBottom: 140 },
  strike: { textDecorationLine: 'line-through' },

  hero: { backgroundColor: theme.colors.surfaceSunken },
  noImage: { alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceMuted },
  noImageDisc: {
    width: 76,
    height: 76,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soldOutWash: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.colors.surface, opacity: 0.5 },
  badges: {
    position: 'absolute',
    left: theme.layout.margin,
    bottom: theme.spacing['3xl'],
    flexDirection: 'row',
    gap: 6,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeLight: { backgroundColor: theme.colors.surface },
  badgeDark: { backgroundColor: theme.colors.accent },
  counter: {
    position: 'absolute',
    right: theme.layout.margin,
    bottom: theme.spacing['3xl'],
    backgroundColor: theme.colors.overlay,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  /** Pulled up over the photo, as on the grocery page. */
  sheet: {
    marginTop: -theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radii.xl,
    borderTopRightRadius: theme.radii.xl,
    paddingHorizontal: theme.layout.margin,
    paddingTop: 22,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  title: { marginTop: 9, fontSize: 22, lineHeight: 27 },
  subRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  attrChip: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg,
  },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  price: { fontSize: 22, lineHeight: 26 },
  saveChip: {
    alignSelf: 'flex-start',
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.promo,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  soldOutNote: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    padding: 13,
  },

  picker: {
    marginTop: 22,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  pickerHeading: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  pickerHeadingSpaced: { marginTop: 20 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: 11 },
  flatRow: { gap: theme.spacing.sm, paddingTop: 11, paddingRight: theme.layout.margin },
  chip: {
    height: 42,
    minWidth: 48,
    paddingHorizontal: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.4,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipBox: { borderRadius: 12 },
  chipPill: { borderRadius: theme.radii.pill, paddingHorizontal: 15 },
  chipOn: { backgroundColor: theme.colors.textPrimary, borderColor: theme.colors.textPrimary },
  chipOff: { borderStyle: 'dashed', backgroundColor: theme.colors.surfaceSunken },
  chipOnOff: { borderStyle: 'solid', backgroundColor: theme.colors.border },
  seeAll: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.4,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: theme.colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: theme.colors.primary },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.primary },
  sheetPrice: { width: 68, textAlign: 'right' },

  block: { marginTop: 26, gap: 9 },
  railBlock: {
    marginTop: 26,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    gap: theme.spacing.md,
  },
  railRow: { gap: theme.spacing.md, paddingRight: theme.layout.margin },
  railCard: { width: 140 },

  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.layout.margin,
    paddingTop: theme.spacing.sm,
  },
  cartBadge: {
    position: 'absolute',
    right: -3,
    top: -3,
    minWidth: 18,
    height: 18,
    borderRadius: theme.radii.pill,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },

  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    gap: theme.spacing.sm,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: theme.layout.margin,
    paddingBottom: theme.spacing.md,
  },
  addedCta: { backgroundColor: theme.colors.accent },
});
