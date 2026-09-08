'use client';

import type { KycStats } from '../../lib/kyc';

function Icon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function KycStats({ stats }: { stats: KycStats | null }) {
  const cards = [
    {
      key: 'awaiting',
      label: 'Awaiting Review',
      value: stats ? String(stats.awaiting) : '—',
      hint:
        stats && stats.awaitingDelta !== 0
          ? `${stats.awaitingDelta > 0 ? '+' : ''}${stats.awaitingDelta} vs yesterday`
          : stats
            ? 'No change vs yesterday'
            : '',
      tone: 'warn',
      icon: 'M4 4h16v16H4z M8 8h8 M8 12h8 M8 16h5',
    },
    {
      key: 'inReview',
      label: 'In Review',
      value: stats ? String(stats.inReview) : '—',
      hint: 'Assigned to a reviewer',
      tone: 'info',
      icon: 'M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z',
    },
    {
      key: 'action',
      label: 'Action Required',
      value: stats ? String(stats.actionRequired) : '—',
      hint: 'Waiting on the driver',
      tone: 'action',
      icon: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z M12 9v4 M12 17h.01',
    },
    {
      key: 'approvedToday',
      label: 'Approved Today',
      value: stats ? String(stats.approvedToday) : '—',
      hint: stats ? 'Decided today' : '',
      tone: 'ok',
      icon: 'M20 6L9 17l-5-5',
    },
    {
      key: 'rejectedToday',
      label: 'Rejected Today',
      value: stats ? String(stats.rejectedToday) : '—',
      hint: stats ? 'Decided today' : '',
      tone: 'bad',
      icon: 'M18 6L6 18 M6 6l12 12',
    },
    {
      key: 'avg',
      label: 'Average Review Time',
      value: stats?.avgReviewLabel ?? '—',
      hint:
        stats?.avgReviewChangePct != null
          ? `${stats.avgReviewChangePct < 0 ? '↓' : '↑'} ${Math.abs(stats.avgReviewChangePct)}% vs previous 7 days`
          : stats
            ? 'Not enough decided cases yet'
            : '',
      tone: 'default',
      icon: 'M12 8v4l3 3 M12 22a10 10 0 110-20 10 10 0 010 20z',
    },
  ];

  return (
    <div className="kpis kyc-kpis">
      {cards.map((c) => (
        <div className={`kpi kyc-kpi ${c.tone}`} key={c.key}>
          <div className="kyc-kpi-top">
            <div className="label">{c.label}</div>
            <span className="kyc-kpi-icon" aria-hidden>
              <Icon d={c.icon} />
            </span>
          </div>
          <div className="value">{c.value}</div>
          {c.hint ? <div className="kyc-kpi-hint muted">{c.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
