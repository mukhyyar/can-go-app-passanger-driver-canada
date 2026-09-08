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

export type OAuthConfig = {
  google: { enabled: boolean; clientId: string | null; localMock: boolean };
  apple: { enabled: boolean; clientId: string | null; localMock: boolean };
};

export type OAuthResult =
  | {
      requiresPhoneLink: true;
      linkToken: string;
      user: AuthUser;
      message?: string;
    }
  | {
      requiresPhoneLink: false;
      accessToken: string;
      refreshToken: string | null;
      user: AuthUser;
    };

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  me: AuthUser | null;
  oauthConfig: OAuthConfig | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: {
    email: string;
    password: string;
    phoneE164: string;
    fullName?: string;
  }) => Promise<{ challengeId: string; debugCode?: string }>;
  sendPhoneOtp: (
    phoneE164: string,
    purpose?: 'login' | 'verify_phone' | 'register',
  ) => Promise<{
    challengeId?: string;
    debugCode?: string;
    message?: string;
  }>;
  verifyOtp: (challengeId: string, code: string) => Promise<void>;
  oauthGoogle: (input: {
    idToken?: string;
    email?: string;
    fullName?: string;
  }) => Promise<OAuthResult>;
  oauthApple: (input: {
    idToken?: string;
    email?: string;
    fullName?: string;
  }) => Promise<OAuthResult>;
  linkOAuthPhone: (
    linkToken: string,
    phoneE164: string,
  ) => Promise<{ challengeId: string; debugCode?: string }>;
  applyOAuthResult: (result: OAuthResult) => Promise<OAuthResult>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [oauthConfig, setOauthConfig] = useState<OAuthConfig | null>(null);

  const applyTokens = useCallback(async (tokens: Tokens) => {
    saveTokens(tokens);
    setToken(tokens.accessToken);
    const profile = await api<AuthUser>('/auth/me', { token: tokens.accessToken });
    setMe(profile);
  }, []);

  const applyOAuthResult = useCallback(
    async (result: OAuthResult) => {
      if (!result.requiresPhoneLink) {
        await applyTokens({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
      }
      return result;
    },
    [applyTokens],
  );

  useEffect(() => {
    api<OAuthConfig>('/auth/oauth/config')
      .then(setOauthConfig)
      .catch(() =>
        setOauthConfig({
          google: { enabled: false, clientId: null, localMock: false },
          apple: { enabled: false, clientId: null, localMock: false },
        }),
      );

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
      oauthConfig,
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
      sendPhoneOtp: (phoneE164, purpose = 'login') =>
        api('/auth/otp/send', {
          method: 'POST',
          body: JSON.stringify({ phoneE164, purpose }),
        }),
      verifyOtp: async (challengeId, code) => {
        const res = await api<Tokens>('/auth/otp/verify', {
          method: 'POST',
          body: JSON.stringify({ challengeId, code }),
        });
        await applyTokens(res);
      },
      oauthGoogle: async (input) => {
        const res = await api<OAuthResult>('/auth/oauth/google', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return applyOAuthResult(res);
      },
      oauthApple: async (input) => {
        const res = await api<OAuthResult>('/auth/oauth/apple', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return applyOAuthResult(res);
      },
      linkOAuthPhone: (linkToken, phoneE164) =>
        api('/auth/oauth/link-phone', {
          method: 'POST',
          body: JSON.stringify({ linkToken, phoneE164 }),
        }),
      applyOAuthResult,
      logout: () => {
        clearTokens();
        setToken(null);
        setMe(null);
      },
    }),
    [applyOAuthResult, applyTokens, me, oauthConfig, ready, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
