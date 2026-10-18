'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Vehicles" path="/admin/vehicles" columns={[
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
        return docs.map(d => `${d.docType}: ${d.status}`).join(', ');
      },
    },
    { key: 'driver.fullName', label: 'Driver', render: (r) => String((r.driver as { fullName?: string })?.fullName ?? '—') },
  ]} hrefFor={(r) => `/users/${(r.driver as { userId?: string })?.userId ?? ''}`} />;
}
