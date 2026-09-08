'use client';

import { useState } from 'react';
import { api } from '../../lib/api';
import { Modal } from '../ui';
import { useToast } from '../toast';

const TTL_OPTIONS = [
  { label: '5 minutes', value: 5 },
  { label: '15 minutes', value: 15 },
  { label: '30 minutes', value: 30 },
  { label: '1 hour', value: 60 },
];

export function LoginLinkModal({
  userId,
  name,
  onClose,
}: {
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [minutes, setMinutes] = useState(15);
  const [reason, setReason] = useState('');
  const [singleUse, setSingleUse] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    loginUrl: string;
    expiresAt: string;
    id: string;
    status: string;
  } | null>(null);

  async function generate() {
    setBusy(true);
    try {
      const res = await api<{
        loginUrl: string;
        expiresAt: string;
        id: string;
        status: string;
      }>(`/admin/users/${userId}/login-links`, {
        method: 'POST',
        body: JSON.stringify({
          expiresInMinutes: minutes,
          reason: reason || 'Temporary secure login link',
          singleUse,
        }),
      });
      setResult(res);
      toast.push('Secure login link generated');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!result) return;
    setBusy(true);
    try {
      await api(`/admin/users/login-links/${result.id}/revoke`, { method: 'POST' });
      setResult({ ...result, status: 'REVOKED' });
      toast.push('Login link revoked');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate Secure Login Link" onClose={onClose}>
      <p className="muted">
        Short-lived, revocable access for <strong>{name}</strong>. Never exposes the password.
      </p>
      {!result ? (
        <>
          <label>
            <span className="label-xs muted">Expires in</span>
            <select
              className="field"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {TTL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="label-xs muted">Reason / reference</span>
            <input
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Support ticket #1234"
            />
          </label>
          <label className="row muted">
            <input
              type="checkbox"
              checked={singleUse}
              onChange={(e) => setSingleUse(e.target.checked)}
            />
            Single use only
          </label>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 12 }}>
            <button type="button" className="btn ghost sm" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn sm" disabled={busy} onClick={() => void generate()}>
              {busy ? 'Generating…' : 'Generate link'}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            Status: <strong>{result.status}</strong>
          </p>
          <p className="muted">Expires {new Date(result.expiresAt).toLocaleString()}</p>
          <p className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
            {result.loginUrl}
          </p>
          <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn sm"
              onClick={() => {
                void navigator.clipboard.writeText(result.loginUrl);
                toast.push('Secure login link copied');
              }}
            >
              Copy link
            </button>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => window.open(result.loginUrl, '_blank', 'noopener')}
            >
              Open link
            </button>
            {result.status === 'ACTIVE' && (
              <button type="button" className="btn danger sm" disabled={busy} onClick={() => void revoke()}>
                Revoke
              </button>
            )}
            <button type="button" className="btn ghost sm" onClick={onClose}>
              Done
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
