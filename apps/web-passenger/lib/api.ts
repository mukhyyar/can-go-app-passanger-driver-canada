import type { Tokens } from './types';

export const API_BASE =
  process.env.NEXT_PUBLIC_CANGO_API_BASE ?? 'http://127.0.0.1:4000/api';

export const TOKEN_KEY = 'cango_web_tokens';

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(message: string, status: number, body: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }

  get code(): string | undefined {
    const c = this.body.code;
    return typeof c === 'string' ? c : undefined;
  }
}

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

export async function api<T = unknown>(
  path: string,
  opts: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set('Accept', 'application/json');
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { message: text };
    }
  }
  if (!res.ok) {
    const body =
      data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
    // Nest sometimes nests the payload under message when using object exceptions
    const nested =
      body.message && typeof body.message === 'object' && !Array.isArray(body.message)
        ? (body.message as Record<string, unknown>)
        : body;
    throw new ApiError(extractError(data, res.status), res.status, {
      ...body,
      ...nested,
    });
  }
  return data as T;
}

function extractError(data: unknown, status: number): string {
  if (data && typeof data === 'object') {
    const rec = data as Record<string, unknown>;
    const msg = rec.message;
    if (Array.isArray(msg)) return msg.map(String).join(', ');
    if (typeof msg === 'string' && msg.trim()) return msg;
    if (msg && typeof msg === 'object') {
      const inner = (msg as Record<string, unknown>).message;
      if (typeof inner === 'string' && inner.trim()) return inner;
    }
    if (typeof rec.error === 'string') return rec.error;
  }
  return `HTTP ${status}`;
}
