'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Refunds & disputes" path="/admin/refunds"
    columns={[
      { key: 'amount', label: 'Amount', type: 'number', align: 'right' },
      { key: 'type', label: 'Type', type: 'enum' },
      { key: 'status', label: 'Status', type: 'enum', render: (r) => <StatusCell value={r.status} /> },
      { key: 'reason', label: 'Reason', type: 'text' },
    ]} />;
}
