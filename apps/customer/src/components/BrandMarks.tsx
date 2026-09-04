import Svg, { Path } from 'react-native-svg';

/**
 * Google's and Apple's own marks, drawn from `Auth & Checkout.dc.html`.
 *
 * These are **brand assets, not iconography**. Both companies publish rules
 * about how their sign-in buttons may look, and neither is satisfied by an
 * approximation: Google's mark is four fixed colours in a fixed arrangement,
 * and Apple's is a shape. Standing in a letter "G" or a person glyph — which is
 * what was here — is both visibly wrong and, for Apple, a review risk.
 *
 * lucide dropped brand icons, so they are inlined as paths rather than pulled
 * from the icon set. Their colours are deliberately hard-coded and must not be
 * themed; that is the one place in this app where `theme.colors` is the wrong
 * answer.
 */
export function GoogleMark({ size = 19 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v9h11.8c-.5 2.7-2 5-4.3 6.5v5.4h7c4.1-3.8 6.6-9.4 6.6-16.2z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.8 0 10.7-1.9 14.3-5.3l-7-5.4c-1.9 1.3-4.4 2.1-7.3 2.1-5.6 0-10.4-3.8-12.1-8.9H4.8v5.6C8.4 41.4 15.6 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.9 28.5c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.6H4.8A22 22 0 0 0 2.4 24.4c0 3.6.9 6.9 2.4 9.7l7.1-5.6z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.2c3.2 0 6 1.1 8.2 3.2l6.2-6.2C34.7 3.7 29.8 1.8 24 1.8 15.6 1.8 8.4 6.4 4.8 13.1l7.1 5.6c1.7-5.1 6.5-8.5 12.1-8.5z"
      />
    </Svg>
  );
}

/** White, because it only ever sits on Apple's required black button. */
export function AppleMark({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill="#FFFFFF"
        d="M16.4 12.7c0-2.4 1.9-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.9-1.5-.1-2.8.8-3.5.8-.7 0-1.8-.8-3-.8-1.6 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.7 2.3 2.9 2.3 1.2 0 1.6-.7 3-.7 1.4 0 1.8.7 3 .7 1.2 0 2.1-1.2 2.9-2.3.6-.9.9-1.4 1.3-2.4-2.4-.9-2.6-3.4-2.6-3.7zM14.3 5.6c.6-.8 1-1.8.9-2.9-.9.1-2 .6-2.7 1.4-.6.7-1 1.8-.9 2.8 1 .1 2-.5 2.7-1.3z"
      />
    </Svg>
  );
}
