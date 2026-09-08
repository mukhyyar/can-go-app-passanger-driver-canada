'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import { Modal } from '../ui';
import { useToast } from '../toast';

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function ResetPasswordModal({
  userId,
  name,
  email,
  onClose,
}: {
  userId: string;
  name: string;
  email?: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(true);
  const [reason, setReason] = useState('');
  const [revokeSessions, setRevokeSessions] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    temporaryPassword?: string;
    sessionsRevoked: boolean;
  } | null>(null);

  async function submit() {
    setBusy(true);
    try {
      const res = await api<{
        ok: boolean;
        temporaryPassword?: string;
        sessionsRevoked: boolean;
      }>(`/admin/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          ...(password.trim() ? { newPassword: password.trim() } : {}),
          reason: reason.trim(),
          revokeSessions,
        }),
      });
      setResult({
        temporaryPassword: res.temporaryPassword ?? (password.trim() || undefined),
        sessionsRevoked: res.sessionsRevoked,
      });
      toast.push('Password reset');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function copyPassword() {
    const value = result?.temporaryPassword;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.push('Password copied');
    } catch {
      toast.push('Could not copy password', 'bad');
    }
  }

  return (
    <Modal title="Reset password" onClose={onClose}>
      <p className="muted">
        Set a new password for <strong>{name}</strong>
        {email ? <span> · {email}</span> : null}. Share it securely — it is not emailed
        automatically.
      </p>

      {result ? (
        <>
          <label>
            <span className="label-xs muted">New password (shown once)</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="field mono"
                readOnly
                value={result.temporaryPassword ?? '—'}
                style={{ marginBottom: 0, flex: 1 }}
              />
              <button type="button" className="btn sm" onClick={() => void copyPassword()}>
                Copy
              </button>
            </div>
          </label>
          <p className="muted" style={{ marginTop: 8 }}>
            {result.sessionsRevoked
              ? 'All active sessions were revoked. The user must sign in again.'
              : 'Existing sessions were left active.'}
          </p>
          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn sm" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      ) : (
        <>
          <label>
            <span className="label-xs muted">New password (leave blank to auto-generate)</span>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="field"
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min 8 characters"
                autoComplete="new-password"
                style={{ marginBottom: 0, flex: 1 }}
              />
              <button type="button" className="btn ghost sm" onClick={() => setShow((v) => !v)}>
                {show ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setPassword(generatePassword());
                  setShow(true);
                }}
              >
                Generate
              </button>
            </div>
          </label>
          <label>
            <span className="label-xs muted">Reason *</span>
            <textarea
              className="field"
              rows={2}
              placeholder="Why is this password being reset?"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <label className="row muted">
            <input
              type="checkbox"
              checked={revokeSessions}
              onChange={(e) => setRevokeSessions(e.target.checked)}
            />
            Revoke all active sessions
          </label>
          <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
            <button type="button" className="btn ghost sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className="btn sm"
              disabled={busy || reason.trim().length < 4 || (password.trim().length > 0 && password.trim().length < 8)}
              onClick={() => void submit()}
            >
              {busy ? 'Resetting…' : 'Reset password'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
