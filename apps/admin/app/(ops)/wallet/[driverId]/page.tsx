'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, hasPermission } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useToast } from '../../../../components/toast';
import { Chip, statusTone, when } from '../../../../components/ui';

type WalletDetail = {
  driver: {
    id: string;
    userId: string;
    fullName: string | null;
    email: string | null;
    phoneE164: string | null;
    approvalStatus: string;
    isActivated: boolean;
  };
  currency: string;
  available: string;
  pending: string;
  balance: string;
  processingPayouts: string;
  lifetimeEarned: string;
  lifetimePaidOut: string;
  nextAvailableAt: string | null;
  entries: Array<{
    id: string;
    type: string;
    direction: string;
    amount: string;
    currency: string;
    status: string;
    description: string;
    availableAt: string | null;
    createdAt: string;
    onHold?: boolean;
    rideId?: string | null;
  }>;
};

export default function DriverWalletDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const canView = hasPermission(me?.permissions, 'finance.view');
  const canManage = hasPermission(me?.permissions, 'finance.wallet_manage');
  const [data, setData] = useState<WalletDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjDir, setAdjDir] = useState<'CREDIT' | 'DEBIT'>('CREDIT');
  const [adjReason, setAdjReason] = useState('');

  const load = useCallback(() => {
    if (!canView || !driverId) return;
    setLoading(true);
    api<WalletDetail>(`/admin/wallet/drivers/${driverId}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [driverId, canView]);

  useEffect(() => {
    load();
  }, [load]);

  async function releaseOne(entryId: string) {
    const r = reason.trim();
    if (r.length < 3) {
      toast.push('Enter a release reason', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/wallet/entries/${entryId}/release`, {
        method: 'POST',
        body: JSON.stringify({ reason: r }),
      });
      toast.push('Released', 'success');
      load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function releaseAllPending() {
    const r = reason.trim();
    if (r.length < 3) {
      toast.push('Enter a release reason', 'error');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ released: number }>(
        `/admin/wallet/drivers/${driverId}/release-pending`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: r }),
        },
      );
      toast.push(`Released ${res.released} entries`, 'success');
      setReason('');
      load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function adjust() {
    const r = adjReason.trim();
    if (r.length < 3) {
      toast.push('Adjustment reason required', 'error');
      return;
    }
    if (!adjAmount.trim()) {
      toast.push('Amount required', 'error');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/wallet/drivers/${driverId}/adjust`, {
        method: 'POST',
        body: JSON.stringify({
          amount: adjAmount.trim(),
          direction: adjDir,
          reason: r,
        }),
      });
      toast.push('Adjustment saved', 'success');
      setAdjAmount('');
      setAdjReason('');
      load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!canView) {
    return (
      <div>
        <h1 className="page-title">Driver Wallet</h1>
        <p className="muted">You need finance.view.</p>
      </div>
    );
  }

  if (loading && !data) return <p className="muted">Loading…</p>;
  if (err) return <p style={{ color: 'crimson' }}>{err}</p>;
  if (!data) return null;

  const { driver, currency } = data;
  const held = data.entries.filter((e) => e.onHold);

  return (
    <div>
      <div className="table-toolbar">
        <div>
          <p className="muted" style={{ margin: 0 }}>
            <Link href="/wallet">← Driver Wallet</Link>
          </p>
          <h1 className="page-title" style={{ marginTop: 4 }}>
            {driver.fullName || driver.email || driver.id}
          </h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            <Link href={`/users/${driver.userId}?tab=wallet`}>User 360</Link>
            {' · '}
            {driver.approvalStatus}
            {driver.isActivated ? ' · Activated' : ''}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {[
          ['Balance', data.balance],
          ['Available', data.available],
          ['On hold', data.pending],
          ['Lifetime earned', data.lifetimeEarned],
          ['Paid out', data.lifetimePaidOut],
          ['Processing', data.processingPayouts],
        ].map(([label, value]) => (
          <div key={label} className="card" style={{ padding: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {label}
            </div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {currency} {value}
            </div>
          </div>
        ))}
      </div>

      {data.nextAvailableAt && (
        <p className="muted">Next auto-release: {when(data.nextAvailableAt)}</p>
      )}

      {canManage && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Release hold</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 220, margin: 0 }}
              placeholder="Reason (required)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={busy || held.length === 0}
              onClick={() => void releaseAllPending()}
            >
              Release all pending ({held.length})
            </button>
          </div>
        </div>
      )}

      {canManage && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Manual adjustment</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              className="field"
              style={{ width: 120, margin: 0 }}
              value={adjDir}
              onChange={(e) => setAdjDir(e.target.value as 'CREDIT' | 'DEBIT')}
            >
              <option value="CREDIT">Credit</option>
              <option value="DEBIT">Debit</option>
            </select>
            <input
              className="field"
              style={{ width: 120, margin: 0 }}
              placeholder="Amount"
              value={adjAmount}
              onChange={(e) => setAdjAmount(e.target.value)}
            />
            <input
              className="field"
              style={{ flex: 1, minWidth: 180, margin: 0 }}
              placeholder="Reason (required)"
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
            />
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={() => void adjust()}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      <h3>Ledger</h3>
      <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Available</th>
              <th>Description</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td>{when(e.createdAt)}</td>
                <td>
                  {e.type} / {e.direction}
                </td>
                <td>
                  {e.currency} {e.amount}
                </td>
                <td>
                  <Chip tone={e.onHold ? 'warn' : statusTone(e.status)}>
                    {e.onHold ? 'ON HOLD' : e.status}
                  </Chip>
                </td>
                <td>{e.availableAt ? when(e.availableAt) : '—'}</td>
                <td>{e.description}</td>
                <td>
                  {canManage && e.onHold && (
                    <button
                      type="button"
                      className="btn ghost sm"
                      disabled={busy}
                      onClick={() => void releaseOne(e.id)}
                    >
                      Release now
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.entries.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No wallet activity yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
