import type { ImageSourcePropType } from 'react-native';

/**
 * User-Agent sent with every remote image request.
 *
 * React Native's Android image pipeline (Fresco → OkHttp) defaults to
 * `okhttp/<version>`, and several image hosts — Wikimedia among them — reject
 * generic library agents outright with a 403. The failure is invisible: the
 * request simply never returns pixels.
 *
 * This string must **fully replace** the default, never extend it: Wikimedia
 * matches on the `okhttp` substring, so `okhttp/4.9.2 Haala/0.1` is still
 * blocked. It also has to identify the app and give a contact route, which is
 * what Wikimedia's User-Agent policy actually asks for.
 */
export const IMAGE_USER_AGENT = 'Haala/0.1 (+https://haala.pk)';

/**
 * Build an `Image` source for a remote URL. Always prefer this over a bare
 * `{ uri }` so the User-Agent above travels with the request.
 */
/**
 * Base URL that root-relative image paths resolve against.
 *
 * Product images are served by our own API as `/static/products/<slug>.jpg`.
 * Storing them relative keeps the database free of a hostname, which differs
 * per client anyway — a phone on a USB tunnel sees `localhost:4000`, a device
 * on Wi-Fi sees a LAN address, production sees a real domain. Each app sets
 * this once at startup from its own config.
 */
let imageBaseUrl = '';

export const setImageBaseUrl = (url: string): void => {
  imageBaseUrl = url.replace(/\/$/, '');
};

/**
 * Build an `Image` source. Accepts either an absolute URL or a root-relative
 * path, which is resolved against {@link setImageBaseUrl}.
 */
export const remoteImageSource = (uri: string): ImageSourcePropType => ({
  uri: uri.startsWith('/') ? `${imageBaseUrl}${uri}` : uri,
  headers: { 'User-Agent': IMAGE_USER_AGENT },
});
