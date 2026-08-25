import { Client } from '@colyseus/sdk';

const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL
  ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;

const TOKEN_STORAGE_KEY = 'kinglier:auth-token';

/**
 * The one Client (SDK) instance for the whole app. It must be shared between
 * account calls (this file) and room joins (OnlineGameClient) because
 * `auth.token` is attached automatically to *every* HTTP request this
 * instance makes — including the internal matchmake calls behind
 * `create`/`joinById` — so a token set here is what makes `KinglierRoom`'s
 * `onAuth` receive it as `context.token`.
 */
export const colyseusClient = new Client(SERVER_WS_URL);
colyseusClient.auth.token = localStorage.getItem(TOKEN_STORAGE_KEY) ?? '';

export interface Account {
  id: string;
  email: string;
  nickname: string;
}

export interface MeResponse {
  user: Account;
  activeRoom: { roomId: string; playerId: string } | null;
}

export function setToken(token: string): void {
  colyseusClient.auth.token = token;
  if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
  else localStorage.removeItem(TOKEN_STORAGE_KEY);
}

/** Reads a magic-link session token out of the URL fragment (set by the
 *  server's /api/auth/verify redirect) and persists it, if present. Must
 *  run once on boot, before the first `fetchMe()` call. */
export function consumeTokenFromUrl(): void {
  const match = location.hash.match(/token=([^&]+)/);
  if (!match) return;
  setToken(decodeURIComponent(match[1]));
  history.replaceState(null, '', location.pathname + location.search);
}

/** In dev (no RESEND_API_KEY on the server), the response carries a
 *  `devToken` that's already a valid session — the server skips the "click
 *  the link in your email" round-trip since there's nowhere to send it. */
export async function requestMagicLink(email: string): Promise<{ devToken?: string }> {
  const response = await colyseusClient.http.post('/api/auth/request-link', { body: { email } });
  return (response.data ?? {}) as { devToken?: string };
}

export async function verifyMagicCode(email: string, code: string): Promise<string> {
  const response = await colyseusClient.http.post('/api/auth/verify-code', {
    body: { email, code }
  });
  return (response.data as { token: string }).token;
}

export async function fetchMe(): Promise<MeResponse | null> {
  if (!colyseusClient.auth.token) return null;
  try {
    const response = await colyseusClient.http.get('/api/me');
    return response.data as MeResponse;
  } catch {
    return null;
  }
}

export function updateNickname(nickname: string): Promise<void> {
  return colyseusClient.http.patch('/api/me', { body: { nickname } }) as unknown as Promise<void>;
}

export function logout(): void {
  setToken('');
}
