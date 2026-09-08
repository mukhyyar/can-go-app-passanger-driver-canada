'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="API / errors" path="/admin/errors" columns={[
    { key: 'source', label: 'Source' }, { key: 'message', label: 'Message' }, { key: 'createdAt', label: 'When' },
  ]} />;
}
