'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Disputes" path="/admin/cases?queue=open" hrefFor={(r) => `/cases?queue=open`}
    columns={[
      { key: 'title', label: 'Title' }, { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status', render: (r) => <StatusCell value={r.status} /> },
    ]} />;
}
