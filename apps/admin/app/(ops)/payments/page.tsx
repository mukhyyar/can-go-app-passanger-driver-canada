'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Payments" path="/admin/payments" hrefFor={(r) => `/rides/${r.rideId}`}
    columns={[
      { key: 'id', label: 'ID', type: 'text' },
      { key: 'amount', label: 'Amount', type: 'number', align: 'right' },
      { key: 'currency', label: 'CCY', type: 'enum' },
      { key: 'status', label: 'Status', type: 'enum', render: (r) => <StatusCell value={r.status} /> },
      { key: 'provider', label: 'Provider', type: 'enum' },
    ]} />
}
