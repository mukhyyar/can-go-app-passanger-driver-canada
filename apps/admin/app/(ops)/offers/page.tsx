'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Bids / Offers" path="/admin/offers" hrefFor={(r) => `/rides/${(r.ride as { id: string }).id}`}
    columns={[
      { key: 'bidAmount', label: 'Bid', type: 'number', align: 'right' },
      { key: 'status', label: 'Status', type: 'enum', render: (r) => <StatusCell value={r.status} /> },
      { key: 'driver.fullName', label: 'Driver', type: 'text', render: (r) => String((r.driver as { fullName?: string })?.fullName ?? '—') },
    ]} />;
}
