import { NextResponse, type NextRequest } from 'next/server';
import { API_BASE, readSession, setSession } from '@/lib/session';

/**
 * Authenticated proxy to the Haala API.
 *
 * The browser calls `/api/haala/<anything>` with no credentials of its own; this
 * handler attaches the bearer token from the httpOnly cookie and forwards. Two
 * things fall out of that:
 *
 *  - the access token is never exposed to client JS, so an XSS can't exfiltrate
 *    an admin session;
 *  - there is no cross-origin request from the browser, so no CORS to widen.
 *
 * On a 401 it transparently refreshes once and replays, mirroring the mobile
 * apps' behaviour so a 15-minute access token doesn't interrupt an operator
 * mid-edit.
 */
const HOP_BY_HOP = new Set(['host', 'connection', 'content-length', 'accept-encoding']);

async function forward(
  req: NextRequest,
  path: string,
  accessToken: string | undefined,
  body: string | undefined,
): Promise<Response> {
  const url = new URL(req.url);
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  return fetch(`${API_BASE}/${path}${url.search}`, {
    method: req.method,
    headers,
    body,
    cache: 'no-store',
  });
}

async function handle(req: NextRequest, ctx: { params: { path: string[] } }) {
  const { path } = ctx.params;
  const target = path.join('/');
  const { accessToken, refreshToken } = readSession();

  // Read the body once — it can't be streamed twice on retry.
  const body = req.method === 'GET' || req.method === 'DELETE' ? undefined : await req.text();

  let res = await forward(req, target, accessToken, body);

  if (res.status === 401 && refreshToken) {
    const refreshed = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });
    if (refreshed.ok) {
      const json = (await refreshed.json()) as {
        data: { tokens: { accessToken: string; refreshToken: string } };
      };
      setSession(json.data.tokens);
      res = await forward(req, target, json.data.tokens.accessToken, body);
    }
  }

  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: { 'content-type': 'application/json' },
  });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
