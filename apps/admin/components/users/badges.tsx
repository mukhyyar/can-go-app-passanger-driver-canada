'use client';

import { useEffect, useState } from 'react';
import { Chip, statusTone } from '../ui';
import { apiBlobUrl } from '../../lib/api';
import { kycShort, roleLabel } from '../../lib/users';
import { kycStatusTone } from '../../lib/kyc';

export function UserAvatar({
  name,
  size = 36,
  avatarPath,
  hasAvatar,
}: {
  name?: string | null;
  size?: number;
  /** Admin API path e.g. `/admin/users/:id/avatar` — fetched with Bearer. */
  avatarPath?: string | null;
  hasAvatar?: boolean;
}) {
  const initials = (name ?? '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setSrc(null);
    if (!hasAvatar || !avatarPath) return;
    (async () => {
      try {
        objectUrl = await apiBlobUrl(avatarPath);
        if (!cancelled) setSrc(objectUrl);
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [avatarPath, hasAvatar]);

  return (
    <span
      className="user-avatar"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
      aria-hidden
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        initials || '?'
      )}
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
