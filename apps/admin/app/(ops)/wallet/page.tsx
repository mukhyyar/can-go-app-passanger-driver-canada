'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, hasPermission } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useToast } from '../../../components/toast';
import { Chip, statusTone, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';
import type { GridColumn } from '../../../lib/grid';

type WalletEntryRow = {
  id: string;
  type: string;
  direction: string;
  amount: string;
  currency: string;
  status: string;
  description: string;
  rideId: string | null;
  availableAt: string | null;
  createdAt: string;
  onHold?: boolean;
  driver?: {
    id: string;
    userId: string;
    fullName: string | null;
    email: string | null;
    phoneE164: string | null;
  };
};

const FILTERS = ['HOLD', 'ALL', 'EARNING', 'ADJUSTMENT', 'PAYOUT'] as const;

export default function DriverWalletPage() {
  const router = useRouter();
  const { me } = useAuth();
  const toast = useToast();
  const canView = hasPermission(me?.permissions, 'finance.view');
  const canManage = hasPermission(me?.permissions, 'finance.wallet_manage');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('HOLD');
  const [rows, setRows] = useState<WalletEntryRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(() => {
    if (!canView) return;
    setLoading(true);
    const q = new URLSearchParams();
    if (filter === 'HOLD') q.set('holdOnly', 'true');
    else if (filter !== 'ALL') q.set('type', filter);
    q.set('limit', '100');
    api<{ items: WalletEntryRow[] }>(`/admin/wallet/entries?${q}`)
      .then((d) => {
        setRows(Array.isArray(d?.items) ? d.items : []);
        setSelected(new Set());
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [filter, canView]);

  useEffect(() => {
    setErr(null);
    load();
  }, [load]);

  async function releaseIds(ids: string[]) {
    const r = reason.trim();
    if (r.length < 3) {
      toast.push('Enter a reason (min 3 characters)', 'bad');
      return;
    }
    if (!ids.length) {
      toast.push('Select at least one entry', 'bad');
      return;
    }
    setBusy(true);
    try {
      const res = await api<{
        released: number;
        skipped: number;
        failed: number;
      }>('/admin/wallet/entries/release-bulk', {
        method: 'POST',
        body: JSON.stringify({ entryIds: ids, reason: r }),
      });
      toast.push(
        `Released ${res.released}, skipped ${res.skipped}, failed ${res.failed}`,
        res.failed ? 'bad' : 'ok',
      );
      setReason('');
      load();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : String(e), 'bad');
    } finally {
      setBusy(false);
    }
  }

  const gridRows = useMemo(
    () =>
      rows.map((e) => ({
        ...e,
        driverName: e.driver?.fullName || e.driver?.email || e.driver?.id || '—',
        userId: e.driver?.userId || '',
        driverId: e.driver?.id || '',
        holdLabel: e.onHold ? 'ON HOLD' : e.status,
      })),
    [rows],
  );

  const columns: GridColumn[] = [
    { key: 'driverName', label: 'Driver', type: 'text' },
    { key: 'type', label: 'Type', type: 'enum' },
    { key: 'direction', label: 'Dir', type: 'enum' },
    {
      key: 'amount',
      label: 'Amount',
      type: 'text',
      render: (r) => (
        <>
          {String(r.currency)} {String(r.amount)}
        </>
      ),
    },
    {
      key: 'holdLabel',
      label: 'Status',
      type: 'enum',
      render: (r) => (
        <Chip tone={r.onHold ? 'warn' : statusTone(String(r.status))}>
          {String(r.holdLabel)}
        </Chip>
      ),
    },
    {
      key: 'availableAt',
      label: 'Available at',
      type: 'date',
      render: (r) => <>{r.availableAt ? when(String(r.availableAt)) : '—'}</>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      type: 'date',
      render: (r) => <>{when(String(r.createdAt))}</>,
    },
    {
      key: 'description',
      label: 'Description',
      type: 'text',
    },
  ];

  if (!canView) {
    return (
      <div>
        <h1 className="page-title">Driver Wallet</h1>
        <p className="muted">You need the finance.view permission.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="table-toolbar">
        <div>
          <h1 className="page-title">Driver Wallet</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Hold earnings, Release Now, and ledger adjustments.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`btn sm ${filter === f ? '' : 'ghost'}`}
              onClick={() => setFilter(f)}
            >
              {f === 'HOLD' ? 'On hold' : f}
            </button>
          ))}
        </div>
      </div>

      {canManage && (
        <div
          className="card"
          style={{
            marginBottom: 12,
            padding: 12,
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            className="field"
            style={{ flex: 1, minWidth: 220, margin: 0 }}
            placeholder="Reason for release (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <button
            type="button"
            className="btn sm"
            disabled={busy || selected.size === 0}
            onClick={() => void releaseIds([...selected])}
          >
            Release selected ({selected.size})
          </button>
        </div>
      )}

      <DataGrid
        rows={gridRows as unknown as Record<string, unknown>[]}
        columns={columns}
        loading={loading}
        error={err}
        persistKey={`/admin/wallet/${filter}`}
        onRefresh={load}
        getRowId={(r) => String(r.id)}
        onRowClick={(row) => {
          const driverId = String(row.driverId || '');
          if (driverId) router.push(`/wallet/${driverId}`);
          else if (row.userId) router.push(`/users/${String(row.userId)}?tab=wallet`);
        }}
        toolbar={
          canManage ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={
                  gridRows.length > 0 &&
                  gridRows.every((r) => selected.has(r.id))
                }
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelected(new Set(gridRows.filter((r) => r.onHold).map((r) => r.id)));
                  } else {
                    setSelected(new Set());
                  }
                }}
              />
              Select all on-hold
            </label>
          ) : null
        }
      />

      {canManage && gridRows.some((r) => r.onHold) && (
        <div style={{ marginTop: 12 }}>
          <p className="muted" style={{ fontSize: 13 }}>
            Tip: open a row for driver wallet detail, or tick on-hold rows above then Release
            selected. Click a driver name row to manage.
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {gridRows
              .filter((r) => r.onHold)
              .slice(0, 20)
              .map((r) => (
                <label
                  key={r.id}
                  className="chip"
                  style={{
                    display: 'inline-flex',
                    gap: 6,
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    border: '1px solid var(--border, #ddd)',
                    borderRadius: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      });
                    }}
                  />
                  <span>
                    {r.driverName} · {r.currency} {r.amount}
                  </span>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={busy}
                    onClick={(ev) => {
                      ev.preventDefault();
                      void releaseIds([r.id]);
                    }}
                  >
                    Release
                  </button>
                </label>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
