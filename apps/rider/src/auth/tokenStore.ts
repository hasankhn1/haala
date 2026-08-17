import * as SecureStore from 'expo-secure-store';

const ACCESS_KEY = 'haala.rider.accessToken';
const REFRESH_KEY = 'haala.rider.refreshToken';

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

/**
 * Native token store — iOS Keychain / Android Keystore via `expo-secure-store`.
 *
 * SecureStore has no web implementation, so web resolves `tokenStore.web.ts`
 * instead (localStorage-backed). Keep the two files' exports in step.
 */
export const tokenStore = {
  async save(tokens: StoredTokens): Promise<void> {
    await Promise.all([
      SecureStore.setItemAsync(ACCESS_KEY, tokens.accessToken),
      SecureStore.setItemAsync(REFRESH_KEY, tokens.refreshToken),
    ]);
  },

  async load(): Promise<StoredTokens | null> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(ACCESS_KEY),
      SecureStore.getItemAsync(REFRESH_KEY),
    ]);
    if (!accessToken || !refreshToken) return null;
    return { accessToken, refreshToken };
  },

  async clear(): Promise<void> {
    await Promise.all([
      SecureStore.deleteItemAsync(ACCESS_KEY),
      SecureStore.deleteItemAsync(REFRESH_KEY),
    ]);
  },
};
