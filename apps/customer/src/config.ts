/// <reference types="expo/types" />

/**
 * Runtime config.
 *
 * The API host differs per target, so the default is resolved from the
 * platform rather than pinned in `.env`:
 *
 *   Android emulator → `10.0.2.2`  (its alias for the host's loopback)
 *   iOS simulator    → `localhost` (shares the host network)
 *   Web              → `localhost` (a browser can't resolve 10.0.2.2)
 *
 * Pinning `10.0.2.2` in `.env` breaks web and iOS, because an env var applies
 * to every platform. Set `EXPO_PUBLIC_API_URL` only to override this — a
 * physical device on the same Wi-Fi (`http://<your-LAN-ip>:4000`) or a
 * deployed environment. Restart Metro with `-c` after changing it.
 */
const DEV_API_PORT = 4000;

/**
 * Everything talks to `localhost:4000` for now.
 *
 * On a physical device that works because the API is tunnelled over USB
 * (`adb reverse tcp:4000 tcp:4000`), which is more reliable than a LAN address
 * — the Mac's DHCP lease changed mid-session once and silently broke sign-in.
 * iOS simulator and web share the host's loopback, so they need nothing extra.
 *
 * The Android **emulator** is the exception: it cannot see the host's
 * localhost and needs `http://10.0.2.2:4000`. Set EXPO_PUBLIC_API_URL in the
 * app's .env for that, or for a real deployment.
 */
const DEFAULT_API_HOST = 'localhost';

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_API_HOST}:${DEV_API_PORT}`;
export const API_PREFIX = '/api/v1';
export const API_BASE = `${API_URL}${API_PREFIX}`;

/**
 * Fallback delivery location when the user hasn't picked one — DHA Peshawar,
 * inside the DHA store's delivery radius so a fresh install can shop
 * immediately instead of hitting "we don't deliver here yet".
 */
export const DEFAULT_LOCATION = { lat: 33.9793, lng: 71.6903 };

/**
 * The delivery promise shown across the app (Home value prop, cart, product
 * detail). A real per-store ETA replaces this once dispatch exists.
 */
export const ETA_MINUTES = 15;

/**
 * Delivery-fee preview. Re-exported from `@haala/shared` so the app and the
 * API cannot disagree about the rule — the fee used to be duplicated here as
 * its own constants, which is one edit away from quoting a total we don't charge.
 * The server still re-prices every order at placement.
 */
export { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD, deliveryFeeFor as estimateDeliveryFee } from '@haala/shared';
