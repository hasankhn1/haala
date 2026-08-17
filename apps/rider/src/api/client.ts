import type { ApiResponse } from '@haala/shared';
import { API_BASE } from '../config';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Module-level access token + hooks the AuthProvider wires up. Keeping this out
// of React means any layer (queries, mutations) can call the API uniformly.
let accessToken: string | null = null;
let onUnauthorized: (() => Promise<string | null>) | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};
export const setUnauthorizedHandler = (fn: (() => Promise<string | null>) | null): void => {
  onUnauthorized = fn;
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  _retried?: boolean;
}

async function raw<T>(path: string, opts: RequestOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  // Attempt a single transparent refresh on 401.
  if (res.status === 401 && !opts._retried && onUnauthorized) {
    const fresh = await onUnauthorized();
    if (fresh) {
      accessToken = fresh;
      return raw<T>(path, { ...opts, _retried: true });
    }
  }

  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError('NETWORK', 'Unexpected server response', res.status);
  if (!json.ok) {
    throw new ApiError(json.error.code, json.error.message, res.status, json.error.details);
  }
  return json.data;
}

export const api = {
  get: <T>(path: string, headers?: Record<string, string>) =>
    raw<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    raw<T>(path, { method: 'POST', body, headers }),
  patch: <T>(path: string, body?: unknown) => raw<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => raw<T>(path, { method: 'DELETE' }),
};
