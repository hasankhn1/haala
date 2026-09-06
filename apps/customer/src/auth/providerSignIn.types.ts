import Constants from 'expo-constants';

/**
 * The contract both Google sign-in implementations honour.
 *
 * There are two, because the platforms genuinely differ. Android and iOS use
 * Google's native SDK, which returns the ID token directly with no browser and
 * no redirect; web uses `expo-auth-session`, where a redirect back to the
 * origin is the normal and supported thing. Metro picks `.web.ts` for web and
 * the bare file everywhere else.
 *
 * The shared contract lives here for the same reason the map components have
 * one: TypeScript resolves `./useProviderSignIn` to the *native* file, so only
 * Metro ever sees the web variant, and nothing would catch the two drifting
 * apart. Neither implementation may re-declare these.
 */
export type ProviderState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | { kind: 'cancelled' }
  | { kind: 'error'; message: string };

export interface ProviderSignIn {
  signIn: () => Promise<void>;
  state: ProviderState;
  reset: () => void;
  /**
   * Stop waiting and treat the attempt as cancelled. Any result arriving
   * afterwards is discarded — nothing can recall a sheet already on screen.
   */
  cancel: () => void;
  /** False until the request is usable. The row stays disabled, with a reason. */
  ready: boolean;
}

/**
 * Client ids, per platform, from the app manifest — **not `process.env`**.
 *
 * The ids are held as ordinary (secret) EAS variables, which are real
 * environment entries *on the build machine* and nowhere else. A phone has no
 * environment, so `process.env` in app code yields only what Metro inlined at
 * bundle time, and Metro inlines only names beginning `EXPO_PUBLIC_`. Reading
 * `process.env.GOOGLE_CLIENT_ID_ANDROID` from a component was therefore
 * `undefined` in every production build — while working in development, which
 * is the single environment where the mistake is invisible.
 *
 * So `app.config.js` reads them on the builder and puts them in `extra`, and
 * they are read back here.
 *
 * Anything that is not a non-empty string counts as unset: Expo serialises an
 * unset value in `extra` as `{}`, which is truthy, so a plain presence check
 * would be wrong.
 */
const asId = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;

const IDS = (Constants.expoConfig?.extra?.googleClientIds ?? {}) as {
  android?: unknown;
  ios?: unknown;
  web?: unknown;
};

export const ANDROID_CLIENT_ID = asId(IDS.android);
export const IOS_CLIENT_ID = asId(IDS.ios);

/**
 * The Web client id, and it is **not only for web**.
 *
 * Google's native SDK takes `webClientId` as the audience it should mint the ID
 * token for — that is what makes `idToken` present at all. So a signed-in
 * Android customer produces a token whose `aud` is this id, *not* the Android
 * one, and `GOOGLE_OAUTH_AUDIENCES` on the server has to contain it. The
 * Android OAuth client still has to exist so Google can check the app's
 * signature; its id simply never appears in code.
 */
export const WEB_CLIENT_ID = asId(IDS.web);
