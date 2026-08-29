import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { theme } from '@haala/design-tokens';
import { remoteImageSource } from './imageSource';
import { Text } from './Text';

export interface ThumbProps {
  imageUrl?: string | null;
  name: string;
  size?: number;
  radius?: number;
  /**
   * Fill the parent box entirely instead of using a fixed size.
   *
   * The parent decides the shape — these wells are not all square (a grid card
   * is ~183x150, the cart upsell 92x70). This used to force `aspectRatio: 1`,
   * which rendered a square inside a landscape well and clipped the bottom off
   * every photo.
   */
  fill?: boolean;
  /**
   * How the photo fits its box. `cover` by default: the comps show full-bleed
   * photography in the rounded well, and `contain` left a clay bar above and
   * below every landscape shot. Pass `contain` where the whole product must be
   * visible — packaging with text on it, for instance.
   */
  resizeMode?: 'cover' | 'contain';
}

const EMOJI: Array<[RegExp, string]> = [
  [/milk|dairy|yogurt|cheese/i, '🥛'],
  [/bread|bun|bakery/i, '🍞'],
  [/egg/i, '🥚'],
  [/apple|banana|fruit|mango/i, '🍎'],
  [/veg|tomato|onion|potato/i, '🥦'],
  [/water|juice|drink|soda|cola/i, '🧃'],
  [/rice|grain|flour|atta/i, '🍚'],
  [/meat|chicken|beef|mutton/i, '🍗'],
  [/snack|chip|biscuit|cookie/i, '🍪'],
  [/oil|ghee/i, '🫒'],
  [/tea|coffee/i, '☕'],
];

/**
 * Image fallbacks sit on warm clay grounds, varied only in tone. The faintest
 * ember wash is included because Basket's category tiles use it — but colour
 * beyond that would make a missing photo the loudest thing on a product grid.
 */
const TINTS = [
  theme.palette.clay[50],
  theme.palette.clay[100],
  theme.palette.clay[200],
  theme.palette.ember[50],
];

const emojiFor = (name: string): string => {
  for (const [re, emoji] of EMOJI) if (re.test(name)) return emoji;
  return '🛒';
};

const tintFor = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash += name.charCodeAt(i);
  return TINTS[hash % TINTS.length] as string;
};

/**
 * Product image with a tasteful emoji/tint fallback.
 *
 * The fallback covers two cases: no image on the product at all, and an image
 * that fails to load (dead URL, offline, host rejecting us). Without the
 * `onError` path a failed fetch renders as an empty box, which looks like a
 * layout bug rather than a missing photo.
 */
export function Thumb({
  imageUrl,
  name,
  size = 64,
  radius = theme.radii.md,
  fill = false,
  resizeMode = 'cover',
}: ThumbProps) {
  const [failed, setFailed] = useState(false);

  // Lists recycle this component, so a new URL must clear a previous failure —
  // otherwise one broken image poisons every row that reuses the slot.
  useEffect(() => setFailed(false), [imageUrl]);

  const dims = fill ? ({ width: '100%', height: '100%' } as const) : { width: size, height: size };
  const emojiSize = fill ? 34 : size * 0.45;

  if (imageUrl && !failed) {
    return (
      <Image
        source={remoteImageSource(imageUrl)}
        style={[dims, { borderRadius: radius }]}
        resizeMode={resizeMode}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[styles.fallback, dims, { borderRadius: radius, backgroundColor: tintFor(name) }]}>
      <Text style={{ fontSize: emojiSize }}>{emojiFor(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
});
