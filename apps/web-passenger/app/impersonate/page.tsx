'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, saveTokens } from '../../lib/api';
import type { Tokens } from '../../lib/types';

function Inner() {
  const sp = useSearchParams();
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = sp.get('t');
    if (!t) {
      setErr('Missing impersonation token');
      return;
    }
    api<Tokens>('/auth/impersonation/consume', {
      method: 'POST',
      body: JSON.stringify({ token: t }),
    })
      .then((tokens) => {
        saveTokens(tokens);
        window.location.replace('/rides');
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [sp]);

  return (
    <main style={{ padding: 48, maxWidth: 560, margin: '0 auto' }}>
      <h1>Opening CAN-RIDE as passenger…</h1>
      {err ? <p>{err}</p> : <p>Validating secure login URL.</p>}
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
