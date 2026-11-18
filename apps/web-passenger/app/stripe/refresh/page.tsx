'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';

interface StripeRefreshResult {
  ok: boolean;
  url?: string | null;
}

function StripeRefreshInner() {
  const sp = useSearchParams();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const accountId = sp.get('accountId') ?? '';
    if (!accountId) {
      setFailed(true);
      return;
    }
    api<StripeRefreshResult>(`/stripe/refresh?accountId=${encodeURIComponent(accountId)}`)
      .then((res) => {
        if (res?.ok && res.url) {
          window.location.replace(res.url);
        } else {
          setFailed(true);
        }
      })
      .catch(() => setFailed(true));
  }, [sp]);

  return (
    <main
      style={{
        minHeight: '80vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: '#fff',
          border: '1px solid #e2e8f0',
          borderRadius: 16,
          maxWidth: 440,
          width: '100%',
          padding: '28px 24px',
          textAlign: 'center',
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.06)',
        }}
      >
        <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>
          {failed ? 'Onboarding Link Expired' : 'Refreshing Stripe Onboarding…'}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#475569', margin: '0 0 22px' }}>
          {failed
            ? 'Please return to the CAN-RIDE Driver App and tap "Set Up Stripe Payouts" to generate a fresh onboarding link.'
            : 'Generating a new secure Stripe Express onboarding session…'}
        </p>
        <a
          href="canride://onboarding/payment"
          style={{
            display: 'inline-block',
            background: '#dc2626',
            color: '#fff',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: 14,
            padding: '12px 20px',
            borderRadius: 10,
          }}
        >
          Return to CAN-RIDE Driver App
        </a>
      </div>
    </main>
  );
}

export default function StripeRefreshPage() {
  return (
    <Suspense>
      <StripeRefreshInner />
    </Suspense>
  );
}
