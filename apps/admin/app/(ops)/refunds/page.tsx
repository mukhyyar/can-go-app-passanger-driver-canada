'use client';
import { ListPage, StatusCell, TimeCell } from '../../../components/list-page';
import { money } from '../../../components/ui';

export default function Page() {
  return (
    <ListPage
      title="Refunds"
      subtitle="Refund history — open a row to manage the parent payment."
      path="/admin/refunds"
      hrefFor={(r) => {
        const pid = String((r.payment as { id?: string } | undefined)?.id ?? r.paymentId ?? '');
        return pid ? `/payments/${pid}` : '/payments';
      }}
      columns={[
        {
          key: 'createdAt',
          label: 'When',
          type: 'date',
          render: (r) => <TimeCell value={r.createdAt} />,
        },
        {
          key: 'amount',
          label: 'Amount',
          type: 'number',
          align: 'right',
          render: (r) => money(Number(r.amount), String(r.currency || 'CAD')),
        },
        { key: 'type', label: 'Type', type: 'enum' },
        {
          key: 'status',
          label: 'Status',
          type: 'enum',
          render: (r) => <StatusCell value={r.status} />,
        },
        { key: 'reason', label: 'Reason', type: 'text' },
        {
          key: 'paymentId',
          label: 'Payment',
          type: 'text',
          render: (r) => {
            const pid = String((r.payment as { id?: string } | undefined)?.id ?? r.paymentId ?? '');
            return <span className="mono">{pid ? `${pid.slice(0, 8)}…` : '—'}</span>;
          },
        },
      ]}
    />
  );
}
