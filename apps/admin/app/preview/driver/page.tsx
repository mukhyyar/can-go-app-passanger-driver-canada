'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, API_BASE } from '@/lib/api';

type Tokens = {
  accessToken: string;
  refreshToken: string | null;
  impersonation?: { readOnly: boolean; expiresAt?: string };
};

function Inner() {
  const sp = useSearchParams();
  const [err, setErr] = useState<string | null>(null);
  const [me, setMe] = useState<Record<string, unknown> | null>(null);
  const [docs, setDocs] = useState<unknown[]>([]);
  const [vehicles, setVehicles] = useState<unknown[]>([]);
  const [requests, setRequests] = useState<unknown[]>([]);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = sp.get('t');
    if (!t) {
      setErr('Missing token');
      return;
    }
    api<Tokens>('/auth/impersonation/consume', {
      method: 'POST',
      body: JSON.stringify({ token: t }),
    })
      .then(async (tokens) => {
        setToken(tokens.accessToken);
        const profile = await api<Record<string, unknown>>('/auth/me', { token: tokens.accessToken });
        setMe(profile);
        try {
          setDocs(await api('/driver/documents', { token: tokens.accessToken }));
        } catch { /* may be empty */ }
        try {
          setVehicles(await api('/driver/vehicles', { token: tokens.accessToken }));
        } catch { /* */ }
        try {
          setRequests(await api('/driver/requests', { token: tokens.accessToken }));
        } catch { /* */ }
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [sp]);

  async function end() {
    if (token) {
      try {
        await api('/auth/impersonation/end', { method: 'POST', token });
      } catch { /* */ }
    }
    window.location.href = 'http://127.0.0.1:3001/';
  }

  const name = String(
    (me?.driver as { fullName?: string } | undefined)?.fullName ||
      me?.email ||
      'driver',
  );

  return (
    <main style={{ padding: 24, maxWidth: 900, margin: '0 auto', fontFamily: 'IBM Plex Sans, sans-serif' }}>
      <div className="imp-banner">
        <span>You are viewing CAN-RIDE as {name} (driver preview)</span>
        <button className="btn sm" onClick={end}>Return to Admin</button>
      </div>
      {err && <p className="err">{err}</p>}
      <h1>Driver preview</h1>
      <p className="muted">Read-only if the impersonation session was issued that way. API: {API_BASE}</p>
      <div className="grid-2">
        <div className="panel">
          <h3>Profile</h3>
          <pre style={{ fontSize: 11 }}>{JSON.stringify(me, null, 2)}</pre>
        </div>
        <div className="panel">
          <h3>Vehicles</h3>
          <pre style={{ fontSize: 11 }}>{JSON.stringify(vehicles, null, 2)}</pre>
        </div>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Documents</h3>
        <pre style={{ fontSize: 11 }}>{JSON.stringify(docs, null, 2)}</pre>
      </div>
      <div className="panel" style={{ marginTop: 12 }}>
        <h3>Open requests</h3>
        <pre style={{ fontSize: 11 }}>{JSON.stringify(requests, null, 2)}</pre>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
