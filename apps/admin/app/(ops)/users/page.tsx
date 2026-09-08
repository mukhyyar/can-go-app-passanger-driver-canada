'use client';

import { ListPage, StatusCell } from '../../../components/list-page';

export default function UsersPage() {
  return (
    <ListPage
      title="All Users"
      subtitle="Passengers, drivers, and staff"
      path="/admin/users"
      hrefFor={(r) => `/users/${r.id}`}
      columns={[
        { key: 'email', label: 'Email', type: 'text' },
        { key: 'phoneE164', label: 'Phone', type: 'text' },
        { key: 'role', label: 'Role', type: 'enum', render: (r) => <StatusCell value={r.role} /> },
        {
          key: 'name',
          label: 'Name',
          type: 'text',
          getValue: (r) =>
            (r.passengerProfile as { fullName?: string } | undefined)?.fullName ||
            (r.driverProfile as { fullName?: string } | undefined)?.fullName ||
            '',
          render: (r) =>
            String(
              (r.passengerProfile as { fullName?: string } | undefined)?.fullName ||
                (r.driverProfile as { fullName?: string } | undefined)?.fullName ||
                '—',
            ),
        },
        {
          key: 'isSuspended',
          label: 'Status',
          type: 'enum',
          getValue: (r) => (r.isSuspended ? 'SUSPENDED' : 'ACTIVE'),
          render: (r) => <StatusCell value={r.isSuspended ? 'SUSPENDED' : 'ACTIVE'} />,
        },
      ]}
    />
  );
}
