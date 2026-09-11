import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { BottomSheet, Button, Text, theme } from '@haala/ui';
import {
  COLOURS,
  PRICE_BANDS,
  SIZES,
  toggle,
  type ClothingFilters,
} from './filters';

export interface BrandOption {
  slug: string;
  name: string;
}

/**
 * The "Filters" chip's bottom sheet.
 *
 * Edits the live filters — the footer's count updates as you toggle, so "Show
 * N items" is a dismiss, not an apply. Only groups with something to offer are
 * drawn; Brand is skipped when the listing has surfaced no brands yet.
 *
 * The comp varies the group set per department tab (Kids gets Age, Shoes gets
 * Shoe size). That needs per-category facet metadata the catalogue does not
 * expose yet, so every clothing tab shows the same four groups for now.
 */
export function FilterSheet({
  visible,
  filters,
  brands,
  resultCount,
  onChange,
  onReset,
  onClose,
}: {
  visible: boolean;
  filters: ClothingFilters;
  brands: BrandOption[];
  resultCount: number;
  onChange: (next: ClothingFilters) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Filters" accessibilityLabel="Filter products">
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {brands.length > 0 ? (
          <Group name="Brand" hint="Any of">
            {brands.map((b) => (
              <TogglePill
                key={b.slug}
                label={b.name}
                on={filters.brands.includes(b.slug)}
                onPress={() => onChange({ ...filters, brands: toggle(filters.brands, b.slug) })}
              />
            ))}
          </Group>
        ) : null}

        <Group name="Size" hint="Any of">
          {SIZES.map((s) => (
            <TogglePill
              key={s}
              label={s}
              on={filters.sizes.includes(s)}
              onPress={() => onChange({ ...filters, sizes: toggle(filters.sizes, s) })}
            />
          ))}
        </Group>

        <Group name="Colour" hint="Any of">
          {COLOURS.map((c) => (
            <TogglePill
              key={c.name}
              label={c.name}
              swatch={c.hex}
              on={filters.colours.includes(c.name)}
              onPress={() => onChange({ ...filters, colours: toggle(filters.colours, c.name) })}
            />
          ))}
        </Group>

        <Group name="Price" hint="Any band">
          {PRICE_BANDS.map((b) => (
            <TogglePill
              key={b.label}
              label={b.label}
              on={filters.priceBands.includes(b.label)}
              onPress={() => onChange({ ...filters, priceBands: toggle(filters.priceBands, b.label) })}
            />
          ))}
        </Group>

        <View style={styles.note}>
          <Text variant="caption" color="textSecondary">
            Size and colour narrow on the server. Brand, price and deals filter as you browse.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.reset} onPress={onReset} accessibilityRole="button">
          <Text variant="label">Reset</Text>
        </Pressable>
        <View style={styles.flex}>
          <Button label={`Show ${resultCount} item${resultCount === 1 ? '' : 's'}`} onPress={onClose} />
        </View>
      </View>
    </BottomSheet>
  );
}

function Group({ name, hint, children }: { name: string; hint: string; children: React.ReactNode }) {
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text variant="bodyStrong">{name}</Text>
        <Text variant="caption" color="textTertiary">
          {hint}
        </Text>
      </View>
      <View style={styles.pills}>{children}</View>
    </View>
  );
}

function TogglePill({
  label,
  on,
  onPress,
  swatch,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  swatch?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${on ? ', selected' : ''}`}
      style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
    >
      {swatch ? <View style={[styles.swatch, { backgroundColor: swatch }]} /> : null}
      <Text variant="labelSm" color={on ? 'primary' : 'textPrimary'}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 380 },
  flex: { flex: 1 },
  group: { paddingBottom: theme.spacing.lg },
  groupHead: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: theme.radii.pill,
    borderWidth: 1.4,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 9,
  },
  pillOff: { borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  pillOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.infoSoft },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: theme.colors.border },
  note: {
    backgroundColor: theme.colors.surfaceSunken,
    borderRadius: theme.radii.sm,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  reset: {
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
});
