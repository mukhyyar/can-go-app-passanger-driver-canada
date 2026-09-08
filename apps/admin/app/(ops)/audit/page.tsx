'use client';
import { ListPage } from '../../../components/list-page';
export default function Page() {
  return (
    <ListPage
      title="Audit logs"
      path="/admin/audit-logs"
      columns={[
        { key: 'action', label: 'Action', type: 'enum' },
        { key: 'resource', label: 'Resource', type: 'enum' },
        { key: 'reason', label: 'Reason', type: 'text' },
        {
          key: 'line',
          label: 'Summary',
          type: 'text',
          getValue: (r) => {
            const email = (r.actor as { email?: string } | null)?.email ?? 'Admin';
            return `${email} ${String(r.action)} ${String(r.resource)}`;
          },
          render: (r) => {
            const email = (r.actor as { email?: string } | null)?.email ?? 'Admin';
            const before = r.before as { isSuspended?: boolean } | null;
            const after = r.after as { isSuspended?: boolean } | null;
            if (before && after && before.isSuspended !== after.isSuspended) {
              return `${email} changed ${r.resource} ${r.resourceId} from ${before.isSuspended ? 'SUSPENDED' : 'ACTIVE'} → ${after.isSuspended ? 'SUSPENDED' : 'ACTIVE'}`;
            }
            return `${email} ${String(r.action)} ${String(r.resource)}`;
          },
        },
        { key: 'actor.email', label: 'Actor', type: 'text', render: (r) => String((r.actor as { email?: string } | null)?.email ?? '—') },
        { key: 'createdAt', label: 'When', type: 'date', render: (r) => new Date(String(r.createdAt)).toLocaleString() },
      ]}
    />
  );
}
