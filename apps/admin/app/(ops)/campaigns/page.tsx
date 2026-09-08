'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Campaigns" path="/admin/notifications/campaigns" columns={[
    { key: 'title', label: 'Title' }, { key: 'segment', label: 'Segment' }, { key: 'status', label: 'Status' },
  ]} />;
}
