'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Risk center" path="/admin/risk/accounts" hrefFor={(r) => `/users/${r.id}`}
    columns={[
      { key: 'email', label: 'Email', type: 'text' },
      { key: 'role', label: 'Role', type: 'enum' },
      { key: 'band', label: 'Risk', type: 'enum', render: (r) => <StatusCell value={r.band} /> },
      { key: 'score', label: 'Score', type: 'number', align: 'right' },
    ]} />;
}
