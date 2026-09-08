'use client';

import type { KpiKey, UserStats } from '../../lib/users';

const CARDS: Array<{
  key: KpiKey;
  label: string;
  get: (s: UserStats | null) => string;
  tone?: string;
}> = [
  { key: 'total', label: 'Total', get: (s) => (s ? String(s.total) : '—') },
  { key: 'passengers', label: 'Passengers', get: (s) => (s ? String(s.passengers) : '—'), tone: 'info' },
  { key: 'drivers', label: 'Drivers', get: (s) => (s ? String(s.drivers) : '—'), tone: 'info' },
  { key: 'active', label: 'Active', get: (s) => (s ? String(s.active) : '—'), tone: 'ok' },
  {
    key: 'pendingVerification',
    label: 'Unverified phone',
    get: (s) => (s ? String(s.pendingVerification) : '—'),
    tone: 'warn',
  },
  {
    key: 'kycPending',
    label: 'KYC pending',
    get: (s) => (s ? String(s.kycPending) : '—'),
    tone: 'warn',
  },
  { key: 'suspended', label: 'Suspended', get: (s) => (s ? String(s.suspended) : '—'), tone: 'bad' },
  {
    key: 'watchlisted',
    label: 'Watchlisted',
    get: (s) => (s ? String(s.watchlisted) : '—'),
    tone: 'action',
  },
  { key: 'newToday', label: 'New today', get: (s) => (s ? String(s.newToday) : '—') },
  { key: 'newThisWeek', label: 'New this week', get: (s) => (s ? String(s.newThisWeek) : '—') },
];

export function UserKpiStrip({
  stats,
  active,
  onSelect,
}: {
  stats: UserStats | null;
  active?: KpiKey | null;
  onSelect: (key: KpiKey) => void;
}) {
  return (
    <div className="user-kpi-strip" role="toolbar" aria-label="User summary filters">
      {CARDS.map((c) => (
        <button
          key={c.key}
          type="button"
          className={`user-kpi-chip ${c.tone ?? ''} ${active === c.key ? 'active' : ''}`}
          onClick={() => onSelect(c.key)}
        >
          <span className="label">{c.label}</span>
          <span className="value">{c.get(stats)}</span>
        </button>
      ))}
    </div>
  );
}
