'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';

interface StripeReturnResult {
  ok: boolean;
  accountId?: string | null;
  status?: string;
  chargesEnabled?: boolean;
  payoutsEnabled?: boolean;
}

function StripeReturnInner() {
  const sp = useSearchParams();
  const [status, setStatus] = useState<string>('SYNCING');
  const [payoutsEnabled, setPayoutsEnabled] = useState<boolean>(false);

  useEffect(() => {
    const accountId = sp.get('accountId') ?? '';
    const q = accountId ? `?accountId=${encodeURIComponent(accountId)}` : '';
    api<StripeReturnResult>(`/stripe/return${q}`)
      .then((res) => {
        setStatus(res?.status || 'PENDING');
        setPayoutsEnabled(Boolean(res?.payoutsEnabled));
      })
      .catch(() => {
        setStatus('PENDING');
      });
  }, [sp]);

  const isActive = status === 'ACTIVE' && payoutsEnabled;

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
        <div
          style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 700,
            color: '#fff',
            background: isActive ? '#15803d' : '#b45309',
            marginBottom: 14,
          }}
        >
          {status}
        </div>
        <h1 style={{ fontSize: 20, margin: '0 0 10px' }}>
          {isActive ? 'Stripe Payouts Connected' : 'Stripe Verification In Progress'}
        </h1>
        <p style={{ fontSize: 14, lineHeight: 1.5, color: '#475569', margin: '0 0 22px' }}>
          {isActive
            ? 'Your Canadian bank account is connected with Stripe Express. You can now return to the CAN-RIDE Driver App.'
            : 'Your details have been submitted to Stripe. Return to the CAN-RIDE Driver App to check your verification status.'}
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

export default function StripeReturnPage() {
  return (
    <Suspense>
      <StripeReturnInner />
    </Suspense>
  );
}
