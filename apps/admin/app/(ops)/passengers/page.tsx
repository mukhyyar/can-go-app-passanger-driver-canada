'use client';
import { useState } from 'react';
import { ListPage, StatusCell } from '../../../components/list-page';
import { CreateUserModal } from '../../../components/users/create-user-modal';

export default function Page() {
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <ListPage
        key={refreshKey}
        title="Passengers"
        path="/admin/passengers"
        hrefFor={(r) => `/users/${(r.user as { id: string }).id}`}
        toolbar={
          <button
            type="button"
            className="btn sm"
            style={{ fontWeight: 600 }}
            onClick={() => setCreateOpen(true)}
          >
            + Create Passenger
          </button>
        }
        columns={[
          { key: 'fullName', label: 'Name', type: 'text' },
          { key: 'user.email', label: 'Email', type: 'text', render: (r) => String((r.user as { email?: string })?.email ?? '—') },
          { key: 'isVip', label: 'VIP', type: 'boolean', render: (r) => <StatusCell value={r.isVip ? 'VIP' : '—'} /> },
          { key: '_count.rides', label: 'Rides', type: 'number', render: (r) => String((r._count as { rides?: number })?.rides ?? 0) },
        ]}
      />
      {createOpen && (
        <CreateUserModal
          initialRole="PASSENGER"
          onClose={() => setCreateOpen(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
