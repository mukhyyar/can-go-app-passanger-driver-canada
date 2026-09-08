'use client';
import { ListPage } from '../../../components/list-page';
import { api } from '../../../lib/api';

export default function Page() {
  return (
    <ListPage title="VIP requests" path="/admin/vip-requests"
      columns={[
        { key: 'fullName', label: 'Name' },
        { key: 'vipRequestedAt', label: 'Requested' },
        {
          key: 'act',
          label: '',
          render: (r) => (
            <button className="btn sm" onClick={async (e) => {
              e.stopPropagation();
              await api(`/admin/passengers/${r.id}/vip`, { method: 'POST', body: JSON.stringify({ isVip: true }) });
            }}>Approve VIP</button>
          ),
        },
      ]}
    />
  );
}
