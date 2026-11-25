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
        title="Driver Operations"
        subtitle="Presence, KYC, trips, last ping"
        path="/admin/drivers"
        hrefFor={(r) => `/users/${(r.user as { id: string }).id}`}
        toolbar={
          <button
            type="button"
            className="btn sm"
            style={{ fontWeight: 600 }}
            onClick={() => setCreateOpen(true)}
          >
            + Create Driver
          </button>
        }
        columns={[
          { key: 'fullName', label: 'Name', type: 'text' },
          { key: 'presence', label: 'Presence', type: 'enum', render: (r) => <StatusCell value={r.presence} /> },
          { key: 'approvalStatus', label: 'KYC', type: 'enum', render: (r) => <StatusCell value={r.approvalStatus} /> },
          { key: 'stats.completed', label: 'Completed', type: 'number', render: (r) => String((r.stats as { completed?: number })?.completed ?? 0) },
          { key: 'stats.cancelled', label: 'Cancelled', type: 'number', render: (r) => String((r.stats as { cancelled?: number })?.cancelled ?? 0) },
          { key: 'stats.active', label: 'On trip', type: 'number', render: (r) => String((r.stats as { active?: number })?.active ?? 0) },
          {
            key: 'locationCurrent',
            label: 'Last loc',
            type: 'date',
            getValue: (r) => (r.locationCurrent as { recordedAt?: string } | null)?.recordedAt,
            render: (r) => {
              const loc = r.locationCurrent as { recordedAt?: string } | null;
              return loc?.recordedAt ? new Date(loc.recordedAt).toLocaleString() : '—';
            },
          },
        ]}
      />
      {createOpen && (
        <CreateUserModal
          initialRole="DRIVER"
          onClose={() => setCreateOpen(false)}
          onCreated={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
