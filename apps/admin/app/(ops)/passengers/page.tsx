'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return (
    <ListPage title="Passengers" path="/admin/passengers" hrefFor={(r) => `/users/${(r.user as { id: string }).id}`}
      columns={[
        { key: 'fullName', label: 'Name', type: 'text' },
        { key: 'user.email', label: 'Email', type: 'text', render: (r) => String((r.user as { email?: string })?.email ?? '—') },
        { key: 'isVip', label: 'VIP', type: 'boolean', render: (r) => <StatusCell value={r.isVip ? 'VIP' : '—'} /> },
        { key: '_count.rides', label: 'Rides', type: 'number', render: (r) => String((r._count as { rides?: number })?.rides ?? 0) },
      ]}
    />
  );
}
