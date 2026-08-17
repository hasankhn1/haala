/// <reference types="expo/types" />
import { Platform } from 'react-native';

/**
 * Runtime config. Mirrors the customer app: the API host is derived from the
 * platform rather than pinned in `.env`, because an env var applies to every
 * target and `10.0.2.2` only means anything inside the Android emulator.
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

/**
 * How often the app pushes a GPS fix while carrying an order. Frequent enough
 * that the customer's map moves, sparse enough not to drain a rider's battery
 * across a shift.
 */
export const LOCATION_INTERVAL_MS = 15_000;
