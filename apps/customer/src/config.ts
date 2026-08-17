/// <reference types="expo/types" />
import { Platform } from 'react-native';

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

const DEFAULT_API_HOST = Platform.select({
  android: '10.0.2.2',
  default: 'localhost',
});

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_API_HOST}:${DEV_API_PORT}`;
export const API_PREFIX = '/api/v1';
export const API_BASE = `${API_URL}${API_PREFIX}`;

/** Fallback delivery location when the user hasn't picked one (DHA Phase 5, Lahore). */
export const DEFAULT_LOCATION = { lat: 31.4697, lng: 74.4111 };

/**
 * The delivery promise shown across the app (Home value prop, cart, product
 * detail). A real per-store ETA replaces this once dispatch exists.
 */
export const ETA_MINUTES = 15;

/**
 * Delivery-fee preview (paisa). Mirrors the server's Orders service; the server
 * remains the source of truth — this is only for showing an estimate pre-order.
 */
export const DELIVERY_FEE = 7900; // PKR 79
export const FREE_DELIVERY_THRESHOLD = 200000; // PKR 2,000

export const estimateDeliveryFee = (subtotal: number): number =>
  subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
