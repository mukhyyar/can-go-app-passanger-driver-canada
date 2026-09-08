'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Suspended accounts" path="/admin/users?suspended=true" hrefFor={(r) => `/users/${r.id}`}
    columns={[
      { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' },
      { key: 'isSuspended', label: 'Status', render: () => <StatusCell value="SUSPENDED" /> },
    ]} />;
}
