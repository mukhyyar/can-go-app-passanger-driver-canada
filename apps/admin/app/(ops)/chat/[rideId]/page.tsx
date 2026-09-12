'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { api } from '../../../../lib/api';
import { Chip, statusTone, when } from '../../../../components/ui';

type ChatMsg = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole?: string | null;
  body: string;
  flagged: boolean;
  deletedAt?: string | null;
  createdAt: string;
};

type ThreadPayload = {
  rideId: string;
  publicCode: string;
  status: string;
  fromLabel?: string;
  toLabel?: string;
  passenger?: { name?: string };
  driver?: { name?: string } | null;
  messages: ChatMsg[];
};

export default function ChatThreadPage() {
  const { rideId } = useParams<{ rideId: string }>();
  const [data, setData] = useState<ThreadPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<ThreadPayload>(`/admin/chat/threads/${rideId}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [rideId]);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p className="muted">Loading conversation…</p>;

  const passengerName = data.passenger?.name ?? 'Passenger';
  const driverName = data.driver?.name ?? 'Driver';

  return (
    <div>
      <p className="muted" style={{ marginBottom: 8 }}>
        <Link href="/chat">← Ride chats</Link>
        {' · '}
        <Link href={`/rides/${data.rideId}`}>Open ride</Link>
      </p>
      <h1 className="page-title">{data.publicCode}</h1>
      <p className="page-sub">
        <Chip tone={statusTone(data.status)}>{data.status}</Chip>
        {' · '}
        {passengerName} ↔ {driverName}
        {data.fromLabel ? ` · ${data.fromLabel} → ${data.toLabel ?? '—'}` : ''}
      </p>

      <div
        className="panel"
        style={{
          maxWidth: 720,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'var(--bg-soft, #f6f6f6)',
        }}
      >
        {data.messages.length === 0 && (
          <p className="muted">No messages in this thread yet.</p>
        )}
        {data.messages.map((m) => {
          const isDriver = String(m.senderRole ?? '').includes('DRIVER');
          const isPassenger = String(m.senderRole ?? '').includes('PASSENGER');
          const mineSide = isDriver ? 'flex-end' : 'flex-start';
          const label = isDriver
            ? driverName
            : isPassenger
              ? passengerName
              : m.senderName;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: mineSide,
                maxWidth: '78%',
                opacity: m.deletedAt ? 0.65 : 1,
              }}
            >
              <div
                className="muted"
                style={{ fontSize: 11, marginBottom: 2 }}
              >
                {label} · {when(m.createdAt)}
                {m.flagged ? ' · flagged' : ''}
                {m.deletedAt ? ' · deleted' : ''}
              </div>
              <div
                style={{
                  background: isDriver ? '#e8f5e9' : '#fff',
                  border: '1px solid var(--border, #e5e5e5)',
                  borderRadius: 12,
                  padding: '8px 12px',
                  whiteSpace: 'pre-wrap',
                  textDecoration: m.deletedAt ? 'line-through' : undefined,
                }}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
