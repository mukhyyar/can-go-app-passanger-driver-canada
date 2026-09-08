'use client';

import { Chip, statusTone } from '../ui';
import { kycShort, roleLabel } from '../../lib/users';
import { kycStatusTone } from '../../lib/kyc';

export function UserAvatar({ name, size = 36 }: { name?: string | null; size?: number }) {
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  return (
    <span
      className="user-avatar"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}

export function RoleBadge({ role }: { role?: string | null }) {
  const tone =
    role === 'SUPER_ADMIN' ? 'ok' : role === 'ADMIN' ? 'info' : statusTone(role ?? '');
  return <Chip tone={tone}>{roleLabel(role)}</Chip>;
}

export function AccountStatusBadge({
  suspended,
  archived,
  anonymized,
}: {
  suspended?: boolean;
  archived?: boolean;
  anonymized?: boolean;
}) {
  if (anonymized) return <Chip tone="bad">Anonymized</Chip>;
  if (archived) return <Chip tone="warn">Archived</Chip>;
  if (suspended) return <Chip tone="bad">Suspended</Chip>;
  return <Chip tone="ok">Active</Chip>;
}

export function KycBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="muted">—</span>;
  return <Chip tone={kycStatusTone(status) as 'ok' | 'warn' | 'bad' | 'info' | 'action' | 'default'}>
    {kycShort(status)}
  </Chip>;
}

export function RiskBadge({ band }: { band?: string | null }) {
  const v = (band ?? 'LOW').toUpperCase();
  const tone =
    v === 'CRITICAL' || v === 'HIGH' ? 'bad' : v === 'MEDIUM' ? 'warn' : v === 'LOW' ? 'ok' : 'info';
  return <Chip tone={tone}>{v}</Chip>;
}

export function VerifyIcon({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}) {
  return (
    <span
      className={`verify-icon ${ok ? 'ok' : 'no'}`}
      title={ok ? `${label} verified` : `${label} not verified`}
      aria-label={ok ? `${label} verified` : `${label} not verified`}
    >
      {ok ? '✓' : '·'}
    </span>
  );
}
