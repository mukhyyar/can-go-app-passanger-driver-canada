'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';

function Inner() {
  const kind = useSearchParams().get('kind') ?? 'rides';
  async function download() {
    const csv = await api<string>(`/admin/reports/${kind}`, { rawText: true });
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `cango-${kind}.csv`;
    a.click();
  }
  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <p className="page-sub">CSV export · {kind}</p>
      <button className="btn" onClick={download}>Download {kind} CSV</button>
    </div>
  );
}
export default function Page() { return <Suspense><Inner /></Suspense>; }
