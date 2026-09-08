'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Login / security logs" path="/admin/sessions" columns={[
    { key: 'user.email', label: 'User', render: (r) => String((r.user as { email?: string })?.email ?? '') },
    { key: 'ip', label: 'IP' }, { key: 'userAgent', label: 'Device' }, { key: 'lastSeenAt', label: 'Last seen' },
  ]} />;
}
