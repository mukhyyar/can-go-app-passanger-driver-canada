'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { api, hasPermission } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { Chip, money, statusTone, when, Modal } from '../../../../components/ui';

export default function RideDetail() {
  const { id } = useParams<{ id: string }>();
  const { me } = useAuth();
  const [ride, setRide] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [refund, setRefund] = useState(false);
  const [reason, setReason] = useState('Customer dispute');
  const [amount, setAmount] = useState('');

  async function load() {
    setRide(await api(`/admin/rides/${id}`));
  }
  useEffect(() => {
    load().catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]);

  async function cancel() {
    await api(`/rides/${id}/transitions`, {
      method: 'POST',
      body: JSON.stringify({ status: 'ADMIN_CANCELLED' }),
    });
    await load();
  }

  async function doRefund(paymentId: string) {
    await api(`/admin/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ reason, amount: amount ? Number(amount) : undefined }),
    });
    setRefund(false);
    await load();
  }

  if (!ride) return <p className="muted">Loading ride…</p>;
  const events = (ride.events as Array<{ toStatus: string; createdAt: string; actorType: string }>) ?? [];
  const offers = (ride.offers as Array<{ id: string; bidAmount: number; status: string; driver?: { fullName?: string } }>) ?? [];
  const payments = (ride.payments as Array<{ id: string; amount: number; status: string; currency: string }>) ?? [];

  return (
    <div>
      <h1 className="page-title">{String(ride.publicCode || ride.id)}</h1>
      <p className="page-sub">
        <Chip tone={statusTone(String(ride.status))}>{String(ride.status)}</Chip> · {String(ride.serviceType)} · {String(ride.fromLabel)} → {String(ride.toLabel ?? '—')}
      </p>
      {err && <p className="err">{err}</p>}
      <div className="row" style={{ marginBottom: 12 }}>
        {hasPermission(me?.permissions, 'rides.cancel') && (
          <button className="btn danger sm" onClick={cancel}>Admin cancel</button>
        )}
        {payments[0] && hasPermission(me?.permissions, 'payments.refund') && (
          <button className="btn ghost sm" onClick={() => setRefund(true)}>Issue refund</button>
        )}
      </div>
      <div className="grid-2">
        <div className="panel">
          <h3>Timeline</h3>
          <ul className="timeline">
            {events.map((e, i) => (
              <li key={i}><strong>{e.toStatus}</strong><div className="muted">{when(e.createdAt)} · {e.actorType}</div></li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Bids</h3>
          {offers.map((o) => (
            <div key={o.id} className="row" style={{ justifyContent: 'space-between' }}>
              <span>{o.driver?.fullName ?? o.id}</span>
              <span>{money(Number(o.bidAmount))} <Chip>{o.status}</Chip></span>
            </div>
          ))}
          <h3 style={{ marginTop: 16 }}>Payments</h3>
          {payments.map((p) => (
            <div key={p.id}>{money(Number(p.amount), p.currency)} · {p.status}</div>
          ))}
        </div>
      </div>
      {refund && payments[0] && (
        <Modal title="Issue refund" onClose={() => setRefund(false)}>
          <input className="field" placeholder="Amount (blank = full)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <textarea className="field" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <button className="btn" onClick={() => doRefund(payments[0].id)}>Refund</button>
        </Modal>
      )}
    </div>
  );
}
