'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api, hasPermission } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { useToast } from '../../../../components/toast';
import {
  PaymentWorkspace,
  type PaymentDetail,
} from '../../../../components/payments/workspace';

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await api<PaymentDetail>(`/admin/payments/${id}`);
      setData(row);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  if (loading && !data) {
    return <p className="muted">Loading payment…</p>;
  }

  if (err && !data) {
    return (
      <div>
        <p className="err">{err}</p>
        <Link className="btn ghost sm" href="/payments">
          Back to payments
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <PaymentWorkspace
      data={data}
      permissions={{
        refund: hasPermission(me?.permissions, 'payments.refund'),
        cases: hasPermission(me?.permissions, 'cases.manage'),
      }}
      onReload={load}
      onToast={(msg, tone) => toast.push(msg, tone)}
    />
  );
}
