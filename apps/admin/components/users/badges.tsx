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

export function RoleBadge({
  role,
  user,
  hasPassenger,
  hasDriver,
  isDual,
}: {
  role?: string | null;
  user?: {
    role?: string | null;
    isDualRole?: boolean;
    hasPassengerProfile?: boolean;
    hasDriverProfile?: boolean;
    passengerProfile?: unknown;
    driverProfile?: unknown;
    roles?: string[];
  } | null;
  hasPassenger?: boolean;
  hasDriver?: boolean;
  isDual?: boolean;
}) {
  const isUserDual =
    Boolean(isDual) ||
    Boolean(user?.isDualRole) ||
    role === 'DUAL' ||
    (Boolean(user?.hasPassengerProfile) && Boolean(user?.hasDriverProfile)) ||
    (Boolean(user?.passengerProfile) && Boolean(user?.driverProfile)) ||
    (Boolean(hasPassenger) && Boolean(hasDriver)) ||
    (Array.isArray(user?.roles) && user!.roles.includes('DRIVER') && user!.roles.includes('PASSENGER'));

  if (isUserDual) {
    return (
      <span
        className="role-chips"
        style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}
        title="Dual Account: Registered as Driver & Passenger with same email"
      >
        <Chip tone="ok">Driver</Chip>
        <Chip tone="info">Passenger</Chip>
        <Chip tone="action">Dual</Chip>
      </span>
    );
  }

  if (user?.roles && user.roles.length > 1) {
    return (
      <span
        className="role-chips"
        style={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}
      >
        {user.roles.map((r) => (
          <Chip
            key={r}
            tone={r === 'DRIVER' ? 'ok' : r === 'PASSENGER' ? 'info' : r === 'SUPER_ADMIN' ? 'ok' : 'info'}
          >
            {roleLabel(r)}
          </Chip>
        ))}
      </span>
    );
  }

  const effectiveRole =
    role ??
    (user?.hasDriverProfile || user?.driverProfile ? 'DRIVER' : null) ??
    (user?.hasPassengerProfile || user?.passengerProfile ? 'PASSENGER' : null) ??
    user?.role ??
    null;

  const tone =
    effectiveRole === 'SUPER_ADMIN'
      ? 'ok'
      : effectiveRole === 'ADMIN'
        ? 'info'
        : effectiveRole === 'DRIVER'
          ? 'ok'
          : effectiveRole === 'PASSENGER'
            ? 'info'
            : statusTone(effectiveRole ?? '');

  return <Chip tone={tone}>{roleLabel(effectiveRole)}</Chip>;
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
