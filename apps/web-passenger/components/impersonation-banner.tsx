'use client';

import { useAuth } from './auth-provider';
import { api } from '../lib/api';
import { ADMIN_RETURN } from '../lib/impersonation';

export function ImpersonationBanner() {
  const { me, token, logout } = useAuth();
  if (!me?.impersonation?.enabled) return null;
  const name = me.passenger?.fullName || me.driver?.fullName || me.email || 'user';
  async function end() {
    try {
      if (token) await api('/auth/impersonation/end', { method: 'POST', token });
    } catch {
      /* still return */
    }
    logout();
    window.location.href = ADMIN_RETURN;
  }
  return (
    <div
      style={{
        background: '#3d3414',
        color: '#f5d565',
        padding: '10px 16px',
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'center',
        fontSize: 14,
      }}
    >
      <span>
        You are viewing CAN-RIDE as <strong>{name}</strong>
        {me.impersonation.readOnly ? ' (read-only)' : ''}
      </span>
      <button
        type="button"
        onClick={end}
        style={{
          background: '#111',
          color: '#fff',
          border: 0,
          borderRadius: 8,
          padding: '6px 12px',
          cursor: 'pointer',
        }}
      >
        Return to Admin
      </button>
    </div>
  );
}
