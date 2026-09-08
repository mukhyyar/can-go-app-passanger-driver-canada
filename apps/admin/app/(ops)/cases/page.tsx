'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DataGrid } from '../../../components/data-grid';
import { StatusCell } from '../../../components/list-page';

function CasesInner() {
  const sp = useSearchParams();
  const queue = sp.get('queue') ?? 'open';
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [title, setTitle] = useState('Support case');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api<Array<Record<string, unknown>>>(`/admin/cases?queue=${queue}`)
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [queue]);

  useEffect(() => { load(); }, [load]);

  async function create() {
    await api('/admin/cases', { method: 'POST', body: JSON.stringify({ title }) });
    load();
  }

  return (
    <div>
      <h1 className="page-title">Support · {queue}</h1>
      <DataGrid
        rows={rows}
        loading={loading}
        error={err}
        persistKey={`cases-${queue}`}
        onRefresh={load}
        toolbar={(
          <div className="row">
            <input className="field" style={{ width: 280, margin: 0 }} value={title} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn sm" onClick={create}>New case</button>
          </div>
        )}
        columns={[
          { key: 'title', label: 'Title', type: 'text' },
          { key: 'type', label: 'Type', type: 'enum' },
          { key: 'status', label: 'Status', type: 'enum', render: (r) => <StatusCell value={r.status} /> },
          { key: 'createdAt', label: 'Opened', type: 'date', render: (r) => r.createdAt ? new Date(String(r.createdAt)).toLocaleString() : '—' },
        ]}
      />
    </div>
  );
}

export default function Page() {
  return <Suspense><CasesInner /></Suspense>;
}
