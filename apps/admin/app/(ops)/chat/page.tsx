'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { ListPage } from '../../../components/list-page';
import { when } from '../../../components/ui';

function Inner() {
  const sp = useSearchParams();
  const flagged = sp.get('flagged') === '1';
  const path = flagged
    ? '/admin/chat/threads?flagged=1'
    : '/admin/chat/threads';

  return (
    <div>
      <div className="tabs" style={{ marginBottom: 12 }}>
        <Link href="/chat" className={!flagged ? 'active' : ''}>
          All chats
        </Link>
        <Link href="/chat?flagged=1" className={flagged ? 'active' : ''}>
          Flagged
        </Link>
      </div>
      <ListPage
        title="Ride chats"
        subtitle="Full passenger ↔ driver conversations (read-only)"
        path={path}
        hrefFor={(row) => `/chat/${String(row.rideId)}`}
        columns={[
          { key: 'publicCode', label: 'Ride' },
          { key: 'passengerName', label: 'Passenger' },
          { key: 'driverName', label: 'Driver', getValue: (r) => r.driverName ?? '—' },
          {
            key: 'lastMessage',
            label: 'Last message',
            getValue: (r) => r.lastMessage ?? '—',
          },
          { key: 'messageCount', label: 'Msgs' },
          { key: 'status', label: 'Status', type: 'enum' },
          {
            key: 'lastMessageAt',
            label: 'Updated',
            type: 'date',
            render: (r) => when(String(r.lastMessageAt ?? r.createdAt ?? '')),
          },
        ]}
      />
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<p className="muted">Loading…</p>}>
      <Inner />
    </Suspense>
  );
}
