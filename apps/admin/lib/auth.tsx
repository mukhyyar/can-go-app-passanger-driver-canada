'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, clearTokens, readTokens, saveTokens, type Tokens } from './api';

export type Me = {
  id: string;
  email?: string | null;
  role: string;
  permissions?: string[];
  adminRole?: { slug: string; name: string } | null;
  impersonation?: Tokens['impersonation'];
};

type AuthState = {
  ready: boolean;
  token: string | null;
  me: Me | null;
  login: (email: string, password: string, totpCode?: string) => Promise<void>;
  logout: () => void;
  refreshMe: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<Me | null>(null);

  const refreshMe = useCallback(async () => {
    const t = readTokens();
    if (!t?.accessToken) {
      setToken(null);
      setMe(null);
      return;
    }
    setToken(t.accessToken);
    const profile = await api<Me>('/auth/me', { token: t.accessToken });
    setMe(profile);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } catch {
        clearTokens();
        setToken(null);
        setMe(null);
      } finally {
        setReady(true);
      }
    })();
  }, [refreshMe]);

  const login = useCallback(
    async (email: string, password: string, totpCode?: string) => {
      const res = await api<Tokens>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, totpCode }),
      });
      saveTokens(res);
      setToken(res.accessToken);
      const profile = await api<Me>('/auth/me', { token: res.accessToken });
      if (profile.role !== 'ADMIN' && profile.role !== 'SUPER_ADMIN') {
        clearTokens();
        setToken(null);
        setMe(null);
        throw new Error('Admin account required');
      }
      setMe(profile);
    },
    [],
  );

  const logout = useCallback(() => {
    clearTokens();
    setToken(null);
    setMe(null);
  }, []);

  const value = useMemo(
    () => ({ ready, token, me, login, logout, refreshMe }),
    [ready, token, me, login, logout, refreshMe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider required');
  return v;
}
