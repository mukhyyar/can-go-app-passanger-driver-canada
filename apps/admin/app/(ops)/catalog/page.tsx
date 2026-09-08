'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Catalog" path="/admin/catalog" columns={[
    { key: 'title', label: 'Title' }, { key: 'serviceType', label: 'Type' }, { key: 'city', label: 'City' }, { key: 'basePrice', label: 'Price' },
  ]} />;
}
