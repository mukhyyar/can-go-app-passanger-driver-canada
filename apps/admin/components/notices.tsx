'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

type Live = Record<string, number>;

export function DriverNotices() {
  const [open, setOpen] = useState(false);
  const [live, setLive] = useState<Live | null>(null);

  useEffect(() => {
    function pull() {
      api<{ live: Live }>('/admin/dashboard/kpis?range=today')
        .then((d) => setLive(d.live))
        .catch(() => undefined);
    }
    pull();
    const t = setInterval(pull, 20000);
    return () => clearInterval(t);
  }, []);

  const items = [
    { href: '/kyc', label: 'Drivers pending KYC', value: live?.pendingKyc ?? 0 },
    { href: '/notifications?channel=push', label: 'Notify drivers', value: live?.onlineDrivers ?? 0 },
    { href: '/drivers', label: 'Drivers on trip', value: live?.inProgress ?? 0 },
    { href: '/drivers', label: 'Online now', value: live?.onlineDrivers ?? 0 },
    { href: '/notifications', label: 'Ratings to review', value: live?.ratingsReview ?? 0 },
  ];
  const alert = items.some((i) => i.value > 0);
  const badge = (live?.pendingKyc ?? 0) + (live?.ratingsReview ?? 0);

  return (
    <div className="notice-wrap">
      <button className="notice-btn" onClick={() => setOpen((o) => !o)} aria-label="Driver notifications">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {alert && <span className="dot" />}
        {badge > 0 && <span className="notice-count">{badge > 9 ? '9+' : badge}</span>}
      </button>
      {open && (
        <div className="notice-drop">
          <p className="muted" style={{ padding: '6px 10px', margin: 0 }}>Driver desk</p>
          {items.map((i) => (
            <Link key={i.href + i.label} href={i.href} onClick={() => setOpen(false)}>
              <span>{i.label}</span>
              <strong>{i.value}</strong>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
