'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Watchlist" path="/admin/watchlist" hrefFor={(r) => `/users/${r.userId}`}
    columns={[
      { key: 'reason', label: 'Reason' },
      { key: 'user.email', label: 'User', render: (r) => String((r.user as { email?: string })?.email ?? r.userId) },
    ]} />;
}
