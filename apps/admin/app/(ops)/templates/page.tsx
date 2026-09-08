'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Notification templates" path="/admin/notifications/templates" columns={[
    { key: 'key', label: 'Key' }, { key: 'channel', label: 'Channel' }, { key: 'title', label: 'Title' },
  ]} />;
}
