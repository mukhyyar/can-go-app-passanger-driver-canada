'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE, readTokens, saveTokens } from '../lib/api';

export type KycContentState = {
  status: 'idle' | 'loading' | 'success' | 'error';
  blobUrl: string | null;
  mimeType: string | null;
  error: string | null;
};

async function fetchDocumentBlob(
  path: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; mimeType: string }> {
  const tokens = readTokens();
  const headers = new Headers();
  headers.set('Accept', '*/*');
  if (tokens?.accessToken) {
    headers.set('Authorization', `Bearer ${tokens.accessToken}`);
  }

  let res = await fetch(`${API_BASE}${path}`, { headers, signal });

  if (
    res.status === 401 &&
    tokens?.refreshToken &&
    !path.includes('/auth/refresh')
  ) {
    const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      signal,
    });
    if (refreshRes.ok) {
      const next = (await refreshRes.json()) as {
        accessToken: string;
        refreshToken?: string | null;
      };
      if (next.accessToken) {
        saveTokens({ ...tokens, ...next });
        headers.set('Authorization', `Bearer ${next.accessToken}`);
        res = await fetch(`${API_BASE}${path}`, { headers, signal });
      }
    }
  }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const mimeType =
    res.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';
  const blob = await res.blob();
  return { blob, mimeType };
}

/**
 * Authenticated KYC document preview via admin content proxy (never MinIO).
 * Creates/revokes object URLs; cancels in-flight fetches on document switch.
 */
export function useKycDocumentContent(
  driverId: string | null | undefined,
  documentId: string | null | undefined,
) {
  const [state, setState] = useState<KycContentState>({
    status: 'idle',
    blobUrl: null,
    mimeType: null,
    error: null,
  });
  const blobUrlRef = useRef<string | null>(null);
  const genRef = useRef(0);

  const revoke = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }, []);

  const load = useCallback(async () => {
    if (!driverId || !documentId) {
      revoke();
      setState({
        status: 'idle',
        blobUrl: null,
        mimeType: null,
        error: null,
      });
      return;
    }

    const gen = ++genRef.current;
    const ac = new AbortController();
    revoke();
    setState({
      status: 'loading',
      blobUrl: null,
      mimeType: null,
      error: null,
    });

    const path = `/admin/drivers/${driverId}/kyc/documents/${documentId}/content`;

    try {
      const { blob, mimeType } = await fetchDocumentBlob(path, ac.signal);
      if (gen !== genRef.current) return;
      const url = URL.createObjectURL(blob);
      blobUrlRef.current = url;
      setState({
        status: 'success',
        blobUrl: url,
        mimeType,
        error: null,
      });
    } catch (e) {
      if (ac.signal.aborted || gen !== genRef.current) return;
      setState({
        status: 'error',
        blobUrl: null,
        mimeType: null,
        error: e instanceof Error ? e.message : 'Preview failed',
      });
    }

    return () => ac.abort();
  }, [driverId, documentId, revoke]);

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();
    const gen = ++genRef.current;

    async function run() {
      if (!driverId || !documentId) {
        revoke();
        if (!cancelled) {
          setState({
            status: 'idle',
            blobUrl: null,
            mimeType: null,
            error: null,
          });
        }
        return;
      }

      revoke();
      if (!cancelled) {
        setState({
          status: 'loading',
          blobUrl: null,
          mimeType: null,
          error: null,
        });
      }

      const path = `/admin/drivers/${driverId}/kyc/documents/${documentId}/content`;
      try {
        const { blob, mimeType } = await fetchDocumentBlob(path, ac.signal);
        if (cancelled || gen !== genRef.current) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setState({
          status: 'success',
          blobUrl: url,
          mimeType,
          error: null,
        });
      } catch (e) {
        if (ac.signal.aborted || cancelled || gen !== genRef.current) return;
        setState({
          status: 'error',
          blobUrl: null,
          mimeType: null,
          error: e instanceof Error ? e.message : 'Preview failed',
        });
      }
    }

    void run();
    return () => {
      cancelled = true;
      ac.abort();
      revoke();
    };
  }, [driverId, documentId, revoke]);

  const download = useCallback(async () => {
    if (!driverId || !documentId) return;
    const path = `/admin/drivers/${driverId}/kyc/documents/${documentId}/content`;
    const { blob, mimeType } = await fetchDocumentBlob(path);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `document-${documentId}`;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return mimeType;
  }, [driverId, documentId]);

  return { ...state, retry: load, download };
}
