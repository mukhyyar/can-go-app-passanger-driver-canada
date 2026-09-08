'use client';

import { useState } from 'react';
import { api } from '../lib/api';
import { hasPermission } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Modal } from './ui';

export function ImpersonateButton({
  userId,
  name,
  variant = 'button',
}: {
  userId: string;
  name?: string;
  variant?: 'button' | 'ghost' | 'menu';
}) {
  const { me } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [readOnly, setReadOnly] = useState(true);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!hasPermission(me?.permissions, 'users.impersonate')) return null;

  async function issue(openTab: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const res = await api<{ loginUrl: string }>("/admin/users/" + userId + "/impersonate", {
        method: 'POST',
        body: JSON.stringify({ reason, readOnly }),
      });
      setUrl(res.loginUrl);
      if (openTab) window.open(res.loginUrl, '_blank', 'noopener');
      else {
        try {
          await navigator.clipboard.writeText(res.loginUrl);
        } catch {
          /* URL is shown in the modal for manual copy */
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {variant === 'menu' ? (
        <button type="button" className="menu-item" onClick={() => setOpen(true)}>
          Login as driver
        </button>
      ) : (
        <button className={`btn sm ${variant === 'ghost' ? 'ghost' : ''}`} onClick={() => setOpen(true)}>
          {variant === 'ghost' ? 'Login as driver' : `Login as ${name ? name.split(' ')[0] : 'user'}`}
        </button>
      )}
      {open && (
        <Modal title="Login as user" onClose={() => setOpen(false)}>
          <p className="muted">
            Issues a short-lived impersonation session. Never reveals the password.
            Auto-expires in about 12 minutes.
          </p>
          <textarea
            className="field"
            rows={3}
            placeholder="Reason (required, min 8 characters)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <label className="row muted">
            <input
              type="checkbox"
              checked={readOnly}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            Read-only impersonation
          </label>
          {err && <p className="err">{err}</p>}
          {url && (
            <p className="mono" style={{ fontSize: 12, wordBreak: 'break-all' }}>
              {url}
            </p>
          )}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn sm" disabled={busy || reason.trim().length < 8} onClick={() => issue(true)}>
              Open as user
            </button>
            <button className="btn ghost sm" disabled={busy || reason.trim().length < 8} onClick={() => issue(false)}>
              Copy login URL
            </button>
            {url && (
              <button
                className="btn ghost sm"
                onClick={() => navigator.clipboard.writeText(url)}
              >
                Copy
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
