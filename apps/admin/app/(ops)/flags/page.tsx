'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { DataGrid } from '../../../components/data-grid';
import { StatusCell } from '../../../components/list-page';

export default function Page() {
  const [flags, setFlags] = useState<Array<{ key: string; enabled: boolean; description: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api<typeof flags>('/admin/feature-flags')
      .then((d) => setFlags(d as typeof flags))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function tog(key: string, enabled: boolean) {
    await api(`/admin/feature-flags/${key}`, { method: 'PATCH', body: JSON.stringify({ enabled: !enabled }) });
    load();
  }

  return (
    <div>
      <h1 className="page-title">Feature flags</h1>
      <DataGrid
        rows={flags as unknown as Record<string, unknown>[]}
        loading={loading}
        error={err}
        persistKey="feature-flags"
        onRefresh={load}
        columns={[
          { key: 'key', label: 'Flag', type: 'text' },
          { key: 'description', label: 'Description', type: 'text' },
          {
            key: 'enabled',
            label: 'State',
            type: 'boolean',
            render: (r) => <StatusCell value={r.enabled ? 'ON' : 'OFF'} />,
          },
          {
            key: 'act',
            label: '',
            filterable: false,
            sortable: false,
            render: (r) => (
              <button className="btn sm" onClick={() => tog(String(r.key), Boolean(r.enabled))}>
                {r.enabled ? 'On' : 'Off'}
              </button>
            ),
          },
        ]}
      />
    </div>
  );
}
