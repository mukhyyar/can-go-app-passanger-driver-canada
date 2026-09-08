'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return <ListPage title="Flagged chats" path="/admin/chat/flagged" columns={[
    { key: 'body', label: 'Message' }, { key: 'senderId', label: 'Sender' },
  ]} />;
}
