'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Vehicles" path="/admin/vehicles" columns={[
    { key: 'plate', label: 'Plate' }, { key: 'name', label: 'Name' }, { key: 'vehicleClass', label: 'Class' },
    { key: 'driver.fullName', label: 'Driver', render: (r) => String((r.driver as { fullName?: string })?.fullName ?? '—') },
  ]} hrefFor={(r) => `/users/${(r.driver as { userId?: string })?.userId ?? ''}`} />;
}
