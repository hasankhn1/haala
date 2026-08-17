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
  /** Fill the parent width as a square (for grid cards) instead of a fixed size. */
  fill?: boolean;
  /**
   * How the photo fits its box. Product shots read better `contain`ed on the
   * neutral ground than cropped, so that's the default.
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
 * Onyx keeps a restricted palette, so image fallbacks sit on neutral slate
 * grounds — varied only in tone, never in hue. Colour here would be the
 * loudest thing on a product grid.
 */
const TINTS = [
  theme.palette.onyx[50],
  theme.palette.onyx[100],
  theme.palette.onyx[200],
  theme.palette.ink[50],
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
  resizeMode = 'contain',
}: ThumbProps) {
  const [failed, setFailed] = useState(false);

  // Lists recycle this component, so a new URL must clear a previous failure —
  // otherwise one broken image poisons every row that reuses the slot.
  useEffect(() => setFailed(false), [imageUrl]);

  const dims = fill ? ({ width: '100%', aspectRatio: 1 } as const) : { width: size, height: size };
  const emojiSize = fill ? 44 : size * 0.45;

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
