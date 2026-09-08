'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTokens, readTokens, saveTokens } from '../lib/api';
import type { AuthUser, Tokens } from '../lib/types';

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  me: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    phoneE164: string;
    fullName?: string;
  }) => Promise<{ challengeId: string; debugCode?: string }>;
  sendPhoneOtp: (phoneE164: string) => Promise<{
    challengeId?: string;
    debugCode?: string;
    message?: string;
  }>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);

  const applyTokens = useCallback(async (tokens: Tokens) => {
    saveTokens(tokens);
    setToken(tokens.accessToken);
    const profile = await api<AuthUser>('/auth/me', { token: tokens.accessToken });
    setMe(profile);
  }, []);

  useEffect(() => {
    const existing = readTokens();
    if (!existing) {
      setReady(true);
      return;
    }
    setToken(existing.accessToken);
    api<AuthUser>('/auth/me', { token: existing.accessToken })
      .then(setMe)
      .catch(() => {
        clearTokens();
        setToken(null);
        setMe(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      token,
      me,
      login: async (email, password) => {
        const res = await api<Tokens>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        await applyTokens(res);
      },
      register: async (input) => {
        return api('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ ...input, role: 'PASSENGER' }),
        });
      },
      sendPhoneOtp: (phoneE164) =>
        api('/auth/otp/send', {
          method: 'POST',
          body: JSON.stringify({ phoneE164, purpose: 'login' }),
        }),
      verifyOtp: async (challengeId, code) => {
        const res = await api<Tokens>('/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ challengeId, code }),
        });
        await applyTokens(res);
      },
      logout: () => {
        clearTokens();
        setToken(null);
        setMe(null);
      },
    }),
    [applyTokens, me, ready, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
