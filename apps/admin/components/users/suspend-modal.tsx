'use client';

import { useState } from 'react';
import { Modal } from '../ui';
import type { UserListRow } from '../../lib/users';

const REASON_CATEGORIES = [
  'Safety',
  'Fraud',
  'Payment',
  'KYC',
  'Terms violation',
  'Duplicate account',
  'User requested',
  'Other',
];

export function SuspendUserModal({
  users,
  suspending,
  busy,
  onClose,
  onConfirm,
}: {
  users: UserListRow[];
  suspending: boolean;
  busy?: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; category: string; notify: boolean }) => void;
}) {
  const [category, setCategory] = useState('Other');
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(false);
  const count = users.length;
  const name = count === 1 ? users[0]?.displayName : `${count} accounts`;

  return (
    <Modal title={suspending ? 'Suspend account' : 'Reactivate account'} onClose={onClose}>
      <p className="muted">
        {suspending
          ? `${name} will immediately lose access to CAN-RIDE.`
          : `${name} will regain access immediately.`}
      </p>
      {count === 1 && (
        <p>
          <strong>{users[0]?.displayName}</strong>
          <span className="muted"> · {users[0]?.role} · {users[0]?.email}</span>
        </p>
      )}
      {suspending && (
        <label>
          <span className="label-xs muted">Reason category</span>
          <select className="field" value={category} onChange={(e) => setCategory(e.target.value)}>
            {REASON_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        <span className="label-xs muted">Reason *</span>
        <textarea
          className="field"
          rows={3}
          placeholder={suspending ? 'Why is this account being suspended?' : 'Why is this account being reactivated?'}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {suspending && (
        <label className="row muted">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Notify user (when notification templates are configured)
        </label>
      )}
      <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
        <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button
          type="button"
          className={`btn sm ${suspending ? 'danger' : ''}`}
          disabled={busy || reason.trim().length < 4}
          onClick={() => onConfirm({ reason: reason.trim(), category, notify })}
        >
          {busy ? 'Working…' : suspending ? 'Confirm suspend' : 'Confirm reactivate'}
        </button>
      </div>
    </Modal>
  );
}
