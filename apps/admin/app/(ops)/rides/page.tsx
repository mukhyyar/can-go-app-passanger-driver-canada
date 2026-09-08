'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { ListPage, StatusCell } from '../../../components/list-page';

function Inner() {
  const sp = useSearchParams();
  const bucket = sp.get('bucket') ?? '';
  const q = sp.get('q') ?? '';
  const title =
    bucket === 'requests' ? 'Ride requests' :
    bucket === 'active' ? 'Active trips' :
    bucket === 'completed' ? 'Completed rides' :
    bucket === 'cancelled' ? 'Cancelled rides' : 'Rides';
  const path = `/admin/rides?${new URLSearchParams({ ...(bucket ? { bucket } : {}), ...(q ? { q } : {}) }).toString()}`;
  return (
    <ListPage title={title} path={path} hrefFor={(r) => `/rides/${r.id}`}
      columns={[
        { key: 'publicCode', label: 'Code', type: 'text' },
        { key: 'status', label: 'Status', type: 'enum', render: (r) => <StatusCell value={r.status} /> },
        { key: 'serviceType', label: 'Service', type: 'enum' },
        { key: 'fromLabel', label: 'From', type: 'text' },
        { key: 'toLabel', label: 'To', type: 'text' },
      ]}
    />
  );
}

export default function Page() {
  return <Suspense><Inner /></Suspense>;
}
