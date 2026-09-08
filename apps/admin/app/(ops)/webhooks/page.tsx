'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Webhooks" path="/admin/webhooks" columns={[
    { key: 'provider', label: 'Provider' }, { key: 'eventId', label: 'Event' }, { key: 'processedAt', label: 'Processed' },
  ]} />;
}
