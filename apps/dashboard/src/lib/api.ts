import type { ApiResponse } from '@haala/shared';

/**
 * Client-side API helper.
 *
 * Everything goes through the Next proxy at `/api/haala/*`, which attaches the
 * bearer token from an httpOnly cookie server-side. That means this file never
 * sees a credential — there is deliberately no token parameter to pass.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/haala${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers },
  });
  const json = (await res.json().catch(() => null)) as ApiResponse<T> | null;
  if (!json) throw new ApiError('NETWORK', 'Unexpected server response', res.status);
  if (!json.ok) throw new ApiError(json.error.code, json.error.message, res.status);
  return json.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: 'PATCH',
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
};

/** Paisa → "Rs 1,234" for display. */
export const money = (paisa: number): string =>
  `Rs ${Math.round(paisa / 100).toLocaleString('en-PK')}`;

/** Rupees typed by an operator → integer paisa for the API. */
export const toPaisa = (rupees: string): number => Math.round(Number(rupees) * 100);
