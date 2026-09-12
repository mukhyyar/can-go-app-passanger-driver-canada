'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { Chip, when } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';

type Delivery = {
  id: string;
  channel: string;
  title?: string | null;
  body?: string | null;
  status: string;
  createdAt: string;
  templateKey?: string | null;
};

function Inner() {
  const sp = useSearchParams();
  const channel = sp.get('channel') ?? 'push';
  const [title, setTitle] = useState('CAN-RIDE driver desk');
  const [body, setBody] = useState('');
  const [segment, setSegment] = useState('DRIVERS');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Delivery[]>('/admin/notifications/deliveries')
      .then((d) => setDeliveries(Array.isArray(d) ? d : []))
      .catch(() => undefined);
  }, [msg]);

  async function send() {
    setBusy(true);
    try {
      const res = await api<{ sent: number }>('/admin/notifications/send', {
        method: 'POST',
        body: JSON.stringify({ channel, segment, title, body }),
      });
      setMsg(`Sent ${res.sent} ${channel} messages to ${segment.toLowerCase()}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const channels = [
    { id: 'push', label: 'Push' },
    { id: 'sms', label: 'SMS' },
    { id: 'email', label: 'Email' },
  ];

  return (
    <div>
      <h1 className="page-title">Driver notifications</h1>
      <p className="page-sub">Broadcast to drivers, passengers, or VIP — same CAN-RIDE voice as the passenger app.</p>
      <div className="tabs">
        {channels.map((c) => (
          <Link key={c.id} href={`/notifications?channel=${c.id}`} className={channel === c.id ? 'active' : ''}>
            {c.label}
          </Link>
        ))}
      </div>
      <div className="grid-2">
        <div className="panel">
          <label className="muted">Audience</label>
          <select className="field" value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="DRIVERS">Drivers</option>
            <option value="PASSENGERS">Passengers</option>
            <option value="VIP">VIP passengers</option>
          </select>
          <label className="muted">Title</label>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="muted">Body</label>
          <textarea className="field" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="KYC reminder, zone surge, or trip alert…" />
          <button className="btn" disabled={busy} onClick={send}>
            {busy ? 'Sending…' : `Send ${channel} to ${segment.toLowerCase()}`}
          </button>
          {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}
        </div>
        <div className="panel">
          <h3>Recent deliveries</h3>
          <DataGrid
            rows={deliveries as unknown as Record<string, unknown>[]}
            persistKey="notif-deliveries"
            maxHeight={420}
            selectable={false}
            columns={[
              { key: 'createdAt', label: 'When', type: 'date', render: (r) => when(String(r.createdAt)) },
              { key: 'channel', label: 'Channel', type: 'enum' },
              { key: 'title', label: 'Title', getValue: (r) => r.title ?? r.body ?? '—' },
              {
                key: 'status',
                label: 'Status',
                type: 'enum',
                render: (r) => (
                  <Chip tone={r.status === 'sent' || r.status === 'delivered' ? 'ok' : 'warn'}>{String(r.status)}</Chip>
                ),
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
