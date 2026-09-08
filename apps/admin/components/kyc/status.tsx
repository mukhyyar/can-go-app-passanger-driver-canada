'use client';

import type { DocIndicator, KycTone } from '../../lib/kyc';
import { kycStatusLabel, kycStatusTone } from '../../lib/kyc';
import { Chip } from '../ui';

export function KycStatusBadge({ status }: { status?: string | null }) {
  const tone = kycStatusTone(status) as 'default' | 'ok' | 'warn' | 'bad' | 'info' | 'action';
  return <Chip tone={tone}>{kycStatusLabel(status)}</Chip>;
}

export function AccountBadge({
  status,
  isActivated,
  isSuspended,
}: {
  status?: string | null;
  isActivated?: boolean;
  isSuspended?: boolean;
}) {
  if (isSuspended || status === 'suspended') return <Chip tone="bad">Suspended</Chip>;
  if (status === 'active' || isActivated) return <Chip tone="ok">Active</Chip>;
  return <Chip>Inactive</Chip>;
}

export function DocGlyph({
  indicator,
  title,
}: {
  indicator: DocIndicator;
  title?: string;
}) {
  const map: Record<DocIndicator, { ch: string; cls: string; label: string }> = {
    approved: { ch: '✓', cls: 'ok', label: 'Approved' },
    attention: { ch: '!', cls: 'action', label: 'Needs attention' },
    pending: { ch: '•', cls: 'warn', label: 'Pending' },
    rejected: { ch: '×', cls: 'bad', label: 'Rejected' },
    missing: { ch: '–', cls: '', label: 'Missing' },
  };
  const m = map[indicator];
  return (
    <span
      className={`doc-glyph ${m.cls}`}
      title={title ? `${title}: ${m.label}` : m.label}
      aria-label={title ? `${title}: ${m.label}` : m.label}
    >
      {m.ch}
    </span>
  );
}

export function KycProgress({
  approved,
  required,
  percent,
  compact,
}: {
  approved: number;
  required: number;
  percent: number;
  compact?: boolean;
}) {
  return (
    <div className={`kyc-progress ${compact ? 'compact' : ''}`}>
      <div className="kyc-progress-meta">
        <strong>
          {approved} / {required} verified
        </strong>
        <span className="muted">{percent}%</span>
      </div>
      <div
        className="kyc-progress-bar"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Verification ${percent} percent complete`}
      >
        <span style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </div>
  );
}

export function Avatar({ name, size = 36 }: { name?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span className="kyc-avatar" style={{ width: size, height: size, fontSize: size * 0.36 }} aria-hidden>
      {initials || '?'}
    </span>
  );
}

export function toneClass(tone: KycTone) {
  return tone === 'default' ? '' : tone;
}
