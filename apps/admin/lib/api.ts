export const API_BASE =
  process.env.NEXT_PUBLIC_CANGO_API_BASE ?? 'http://127.0.0.1:4000/api';

export const TOKEN_KEY = 'cango_admin_tokens';
export const ADMIN_URL = 'http://127.0.0.1:3001';

export type Tokens = {
  accessToken: string;
  refreshToken: string | null;
  impersonation?: {
    enabled: boolean;
    by?: string;
    sessionId?: string;
    readOnly: boolean;
    expiresAt?: string;
  };
};

export function readTokens(): Tokens | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Tokens;
  } catch {
    return null;
  }
}

export function saveTokens(tokens: Tokens) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

export function clearTokens() {
  localStorage.removeItem(TOKEN_KEY);
}

export function hasPermission(perms: string[] | undefined, need: string) {
  if (!perms) return false;
  if (perms.includes('*')) return true;
  return perms.includes(need);
}

async function refreshAccess(refreshToken: string): Promise<Tokens | null> {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  return (await res.json()) as Tokens;
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { token?: string | null; rawText?: boolean } = {},
): Promise<T> {
  const tokens = readTokens();
  const token = opts.token ?? tokens?.accessToken;
  const headers = new Headers(opts.headers);
  headers.set('Accept', opts.rawText ? 'text/csv' : 'application/json');
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401 && tokens?.refreshToken && !path.includes('/auth/refresh')) {
    const next = await refreshAccess(tokens.refreshToken);
    if (next?.accessToken) {
      saveTokens({ ...tokens, ...next });
      headers.set('Authorization', `Bearer ${next.accessToken}`);
      res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
    }
  }

  if (opts.rawText) {
    const text = await res.text();
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return text as T;
  }

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      (data && (data.message?.toString?.() || data.message)) ||
      `HTTP ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : String(msg));
  }
  return data as T;
}
