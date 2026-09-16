'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, hasPermission } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Chip, statusTone, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';
import type { GridColumn } from '../../../lib/grid';

type PayoutRow = {
  driverId: string;
  userId: string;
  fullName: string;
  email: string | null;
  phoneE164: string | null;
  payoutStatus: string;
  bankCountry: string | null;
  outpaymentCurrency: string | null;
  payoutMethod: string | null;
  accountHolderName: string | null;
  accountMask: string | null;
  updatedAt: string;
};

const FILTERS = ['PENDING', 'VERIFIED', 'REJECTED', 'CONFIGURED', 'ALL'] as const;

export default function PayoutReviewsPage() {
  const router = useRouter();
  const { me } = useAuth();
  const canReview = hasPermission(me?.permissions, 'finance.payout_review');
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('PENDING');
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!canReview) return;
    setLoading(true);
    api<PayoutRow[]>(`/admin/payout-reviews?status=${encodeURIComponent(status)}`)
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [status, canReview]);

  useEffect(() => {
    setErr(null);
    load();
  }, [load]);

  if (!canReview) {
    return (
      <div>
        <h1 className="page-title">Payout Reviews</h1>
        <p className="muted">You need the finance.payout_review permission.</p>
      </div>
    );
  }

  const columns: GridColumn[] = [
    { key: 'fullName', label: 'Driver', type: 'text' },
    {
      key: 'payoutStatus',
      label: 'Status',
      type: 'enum',
      render: (r) => (
        <Chip tone={statusTone(String(r.payoutStatus))}>{String(r.payoutStatus)}</Chip>
      ),
    },
    { key: 'accountHolderName', label: 'Account holder', type: 'text' },
    { key: 'accountMask', label: 'Account', type: 'text' },
    { key: 'bankCountry', label: 'Bank country', type: 'text' },
    { key: 'outpaymentCurrency', label: 'Currency', type: 'text' },
    { key: 'payoutMethod', label: 'Method', type: 'text' },
    {
      key: 'updatedAt',
      label: 'Updated',
      type: 'date',
      render: (r) => <>{when(r.updatedAt as string)}</>,
    },
  ];

  return (
    <div>
      <div className="table-toolbar">
        <div>
          <h1 className="page-title">Payout Reviews</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>
            Approve or reject driver bank / payout details before withdrawals.
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
              {f}
            </button>
          ))}
        </div>
      </div>
      <DataGrid
        rows={rows as unknown as Record<string, unknown>[]}
        columns={columns}
        loading={loading}
        error={err}
        persistKey={`/admin/payout-reviews/${status}`}
        onRefresh={load}
        onRowClick={(row) => router.push(`/users/${String(row.userId)}?tab=payout`)}
      />
    </div>
  );
}
