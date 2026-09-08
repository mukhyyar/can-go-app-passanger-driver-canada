'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Driver earnings" path="/admin/earnings"
    columns={[
      { key: 'fullName', label: 'Driver' }, { key: 'n', label: 'Trips' },
      { key: 'earning', label: 'Earning' }, { key: 'commission', label: 'Commission' },
    ]} />;
}
