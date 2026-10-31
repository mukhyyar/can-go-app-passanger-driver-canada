'use client';
import { useState } from 'react';
import { ListPage } from '../../../components/list-page';
import { api } from '../../../lib/api';

export default function Page() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function approveVehicle(id: string) {
    setBusyId(id);
    try {
      await api(`/admin/vehicles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          approvalStatus: 'APPROVED',
          inspectionStatus: 'APPROVED',
        }),
      });
      setRefreshKey((k) => k + 1);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ListPage
      key={refreshKey}
      title="Vehicles"
      path="/admin/vehicles"
      columns={[
        { key: 'plate', label: 'Plate' },
        { key: 'make', label: 'Make', render: (r) => String((r as { make?: string })?.make ?? '—') },
        { key: 'model', label: 'Model', render: (r) => String((r as { model?: string })?.model ?? (r as { name?: string })?.name ?? '—') },
        { key: 'year', label: 'Year', render: (r) => String((r as { year?: number })?.year ?? '—') },
        { key: 'vehicleClass', label: 'Category' },
        { key: 'passengerSeats', label: 'Seats', render: (r) => String((r as { passengerSeats?: number })?.passengerSeats ?? '—') },
        { key: 'luggagePlaces', label: 'Luggage', render: (r) => String((r as { luggagePlaces?: number })?.luggagePlaces ?? '—') },
        { key: 'inspectionStatus', label: 'Inspection', render: (r) => String((r as { inspectionStatus?: string })?.inspectionStatus ?? 'PENDING') },
        { key: 'approvalStatus', label: 'Approval', render: (r) => String((r as { approvalStatus?: string })?.approvalStatus ?? 'PENDING') },
        {
          key: 'documents',
          label: 'Documents',
          render: (r) => {
            const docs = (r as { documents?: Array<{ docType: string; status: string }> })?.documents ?? [];
            if (docs.length === 0) return 'None';
            return docs.map((d) => `${d.docType}: ${d.status}`).join(', ');
          },
        },
        { key: 'driver.fullName', label: 'Driver', render: (r) => String((r.driver as { fullName?: string })?.fullName ?? '—') },
        {
          key: 'actions',
          label: 'Action',
          render: (r) => {
            const id = String((r as { id?: string })?.id ?? '');
            const approval = String((r as { approvalStatus?: string })?.approvalStatus ?? 'PENDING').toUpperCase();
            const inspection = String((r as { inspectionStatus?: string })?.inspectionStatus ?? 'PENDING').toUpperCase();
            if (approval === 'APPROVED' && inspection === 'APPROVED') {
              return <span className="muted">Approved</span>;
            }
            return (
              <button
                className="btn sm"
                type="button"
                disabled={busyId === id}
                onClick={(e) => {
                  e.stopPropagation();
                  void approveVehicle(id);
                }}
              >
                {busyId === id ? 'Approving…' : 'Approve'}
              </button>
            );
          },
        },
      ]}
      hrefFor={(r) => `/users/${(r.driver as { userId?: string })?.userId ?? ''}`}
    />
  );
}
