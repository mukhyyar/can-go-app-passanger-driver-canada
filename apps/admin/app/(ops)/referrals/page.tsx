'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Referrals" path="/admin/referrals" columns={[
    { key: 'code', label: 'Code' }, { key: 'role', label: 'Role' }, { key: 'creditAmount', label: 'Credit' },
  ]} />;
}
