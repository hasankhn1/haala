/// <reference types="expo/types" />

/**
 * Runtime config. Mirrors the customer app: the API host is derived from the
 * platform rather than pinned in `.env`, because an env var applies to every
 * target and `10.0.2.2` only means anything inside the Android emulator.
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
 * How often the app pushes a GPS fix while carrying an order. Frequent enough
 * that the customer's map moves, sparse enough not to drain a rider's battery
 * across a shift.
 */
export const LOCATION_INTERVAL_MS = 15_000;
