'use client';

import Link from 'next/link';
import { Drawer, when } from '../ui';
import { ImpersonateButton } from '../impersonate';
import {
  AccountStatusBadge,
  KycBadge,
  RiskBadge,
  RoleBadge,
  UserAvatar,
  VerifyIcon,
} from './badges';
import type { UserListRow } from '../../lib/users';
import { relativeTime, shortId } from '../../lib/users';
import { hasPermission } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export function UserPreviewDrawer({
  user,
  onClose,
  onSuspend,
  onResetPassword,
}: {
  user: UserListRow;
  onClose: () => void;
  onSuspend: (user: UserListRow) => void;
  onResetPassword?: (user: UserListRow) => void;
}) {
  const { me } = useAuth();
  const canSuspend = hasPermission(me?.permissions, 'users.suspend');
  const canResetPassword = hasPermission(me?.permissions, 'users.reset_password');

  return (
    <Drawer
      title="User preview"
      onClose={onClose}
      width={440}
      footer={
        <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <Link className="btn sm" href={`/users/${user.id}`} onClick={onClose}>
            Open full profile
          </Link>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <ImpersonateButton userId={user.id} name={user.displayName} variant="ghost" />
            {canResetPassword && onResetPassword && (
              <button type="button" className="btn ghost sm" onClick={() => onResetPassword(user)}>
                Reset password
              </button>
            )}
            {canSuspend && (
              <button type="button" className="btn danger sm" onClick={() => onSuspend(user)}>
                {user.isSuspended ? 'Reactivate' : 'Suspend'}
              </button>
            )}
          </div>
        </div>
      }
    >
      <div className="preview-hero">
        <UserAvatar
          name={user.displayName}
          size={48}
          hasAvatar={Boolean(user.hasAvatar)}
          avatarPath={user.avatarPath}
        />
        <div>
          <strong style={{ fontSize: 18 }}>{user.displayName}</strong>
          <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
            <RoleBadge role={user.role} />
            <AccountStatusBadge
              suspended={user.isSuspended}
              archived={user.accountStatus === 'ARCHIVED'}
              anonymized={user.accountStatus === 'ANONYMIZED'}
            />
            {user.kycStatus ? <KycBadge status={user.kycStatus} /> : null}
            <RiskBadge band={user.riskBand} />
          </div>
        </div>
      </div>

      <div className="preview-grid">
        <div>
          <div className="muted label-xs">User ID</div>
          <div className="mono">{shortId(user.id)}</div>
        </div>
        <div>
          <div className="muted label-xs">Registered</div>
          <div>{when(user.createdAt)}</div>
        </div>
        <div>
          <div className="muted label-xs">Email</div>
          <div className="row" style={{ gap: 4 }}>
            <span>{user.email || '—'}</span>
            <VerifyIcon ok={Boolean(user.email)} label="Email" />
          </div>
        </div>
        <div>
          <div className="muted label-xs">Phone</div>
          <div className="row" style={{ gap: 4 }}>
            <span>{user.phoneE164 || '—'}</span>
            <VerifyIcon ok={Boolean(user.phoneVerifiedAt)} label="Phone" />
          </div>
        </div>
        <div>
          <div className="muted label-xs">Last active</div>
          <div>{relativeTime(user.lastActiveAt)}</div>
        </div>
        <div>
          <div className="muted label-xs">Rides</div>
          <div>{user.rideCount ?? '—'}</div>
        </div>
        <div>
          <div className="muted label-xs">Location</div>
          <div>{user.location || '—'}</div>
        </div>
        <div>
          <div className="muted label-xs">Plate</div>
          <div>{user.plate || '—'}</div>
        </div>
      </div>

      {user.watchlisted ? (
        <p className="muted" style={{ marginTop: 12 }}>
          On watchlist
        </p>
      ) : null}
    </Drawer>
  );
}
