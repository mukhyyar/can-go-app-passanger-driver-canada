'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { Chip, money, statusTone, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';
import type { GridColumn } from '../../../lib/grid';
import { shortId } from '../../../lib/users';

const FILTERS = ['ALL', 'succeeded', 'pending', 'failed', 'requires_payment_method', 'canceled'] as const;

export default function PaymentsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('ALL');
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const q = status === 'ALL' ? '' : `?status=${encodeURIComponent(status)}`;
    api<Record<string, unknown>[]>(`/admin/payments${q}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    setErr(null);
    load();
  }, [load]);

  const columns: GridColumn[] = [
    {
      key: 'id',
      label: 'Payment',
      type: 'text',
      render: (r) => <span className="mono">{shortId(String(r.id))}</span>,
    },
    {
      key: 'createdAt',
      label: 'Created',
      type: 'date',
      render: (r) => <>{when(r.createdAt as string)}</>,
    },
    {
      key: 'amount',
      label: 'Amount',
      type: 'number',
      align: 'right',
      render: (r) => (
        <strong>{money(Number(r.amount), String(r.currency || 'CAD'))}</strong>
      ),
    },
    {
      key: 'refundedTotal',
      label: 'Refunded',
      type: 'number',
      align: 'right',
      render: (r) => {
        const n = Number(r.refundedTotal ?? 0);
        return n > 0 ? money(n, String(r.currency || 'CAD')) : <span className="muted">—</span>;
      },
    },
    {
      key: 'status',
      label: 'Status',
      type: 'enum',
      render: (r) => <Chip tone={statusTone(String(r.status))}>{String(r.status)}</Chip>,
    },
    {
      key: 'paymentMode',
      label: 'Mode',
      type: 'enum',
      render: (r) => <Chip>{String(r.paymentMode || 'FULL')}</Chip>,
    },
    {
      key: 'provider',
      label: 'Provider',
      type: 'enum',
    },
    {
      key: 'ride',
      label: 'Ride',
      type: 'text',
      render: (r) => {
        const ride = r.ride as { publicCode?: string; id?: string } | null;
        return <span className="mono">{ride?.publicCode ?? (ride?.id ? shortId(ride.id) : '—')}</span>;
      },
    },
  ];

  return (
    <div>
      <div className="table-toolbar">
        <div>
          <h1 className="page-title">Payments</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Charges, refunds, and payment ops — open a row for the full workspace.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`btn sm ${status === f ? '' : 'ghost'}`}
              onClick={() => setStatus(f)}
            >
              {f === 'ALL' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>
      <DataGrid
        rows={rows}
        columns={columns}
        loading={loading}
        error={err}
        persistKey={`/admin/payments/${status}`}
        onRefresh={load}
        onRowClick={(row) => router.push(`/payments/${String(row.id)}`)}
      />
    </div>
  );
}
