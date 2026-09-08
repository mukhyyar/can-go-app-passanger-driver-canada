'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Operating zones" path="/admin/zones"
    columns={[
      { key: 'name', label: 'Name' }, { key: 'zoneType', label: 'Type' },
      { key: 'driver.fullName', label: 'Driver', render: (r) => String((r.driver as { fullName?: string })?.fullName ?? '—') },
    ]} />;
}
