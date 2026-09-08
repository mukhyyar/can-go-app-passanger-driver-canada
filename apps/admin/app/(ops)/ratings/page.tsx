'use client';
import { ListPage, StatusCell } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Ratings" path="/admin/ratings" columns={[
    { key: 'stars', label: 'Stars' }, { key: 'comment', label: 'Comment' },
    { key: 'moderationStatus', label: 'Moderation', render: (r) => <StatusCell value={r.moderationStatus} /> },
  ]} />;
}
