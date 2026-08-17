import AsyncStorage from '@react-native-async-storage/async-storage';

const ACCESS_KEY = 'haala.accessToken';
const REFRESH_KEY = 'haala.refreshToken';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Web token store.
 *
 * `expo-secure-store` is backed by the iOS Keychain and Android Keystore and
 * has **no web implementation** — the module resolves on web but its native
 * methods are undefined, which surfaces as
 * `_ExpoSecureStore.default.getValueWithKeyAsync is not a function`. Metro
 * prefers this `.web.ts` file, so the web bundle never touches SecureStore.
 *
 * On web this is `localStorage` (AsyncStorage's web backend). That is **not**
 * equivalent security: localStorage is readable by any script on the origin, so
 * an XSS bug leaks the refresh token. Acceptable for the web preview build,
 * which exists so the UI can be reviewed in a browser; the shipping surfaces
 * are the native apps, where the real Keychain/Keystore path is used. If web
 * ever becomes a production target, move to a short-lived in-memory access
 * token plus an httpOnly refresh cookie issued by the API.
 */
export const tokenStore = {
  async save(tokens: StoredTokens): Promise<void> {
    await AsyncStorage.multiSet([
      [ACCESS_KEY, tokens.accessToken],
      [REFRESH_KEY, tokens.refreshToken],
    ]);
  },

  async load(): Promise<StoredTokens | null> {
    const entries = await AsyncStorage.multiGet([ACCESS_KEY, REFRESH_KEY]);
    const accessToken = entries.find(([k]) => k === ACCESS_KEY)?.[1];
    const refreshToken = entries.find(([k]) => k === REFRESH_KEY)?.[1];
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  },

  async clear(): Promise<void> {
    await AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]);
  },
};
