'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Chip } from '../../../components/ui';
import { DataGrid } from '../../../components/data-grid';

export default function PromosPage() {
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [code, setCode] = useState('');
  const [pct, setPct] = useState('10');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  function load() {
    setLoading(true);
    api<Array<Record<string, unknown>>>('/admin/promos')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function create() {
    await api('/admin/promos', { method: 'POST', body: JSON.stringify({ code, percentOff: Number(pct) }) });
    load();
  }
  async function toggle(id: string, active: boolean) {
    await api(`/admin/promos/${id}`, { method: 'PATCH', body: JSON.stringify({ active: !active }) });
    load();
  }
  return (
    <div>
      <h1 className="page-title">Promotions</h1>
      <DataGrid
        rows={rows}
        loading={loading}
        error={err}
        persistKey="promos"
        onRefresh={load}
        toolbar={(
          <div className="row">
            <input className="field" style={{ width: 160, margin: 0 }} placeholder="CODE" value={code} onChange={(e) => setCode(e.target.value)} />
            <input className="field" style={{ width: 80, margin: 0 }} value={pct} onChange={(e) => setPct(e.target.value)} />
            <button className="btn sm" onClick={create}>Create</button>
          </div>
        )}
        columns={[
          { key: 'code', label: 'Code', type: 'text' },
          { key: 'percentOff', label: '% off', type: 'number' },
          { key: 'amountOff', label: 'Amount off', type: 'number' },
          {
            key: 'active',
            label: 'Status',
            type: 'boolean',
            render: (r) => <Chip tone={r.active ? 'ok' : 'default'}>{r.active ? 'active' : 'off'}</Chip>,
          },
          { key: 'usedCount', label: 'Uses', type: 'text', getValue: (r) => `${r.usedCount}/${r.maxUses ?? '∞'}` },
          {
            key: 'act',
            label: '',
            filterable: false,
            sortable: false,
            render: (r) => (
              <button className="btn ghost sm" onClick={() => toggle(String(r.id), Boolean(r.active))}>Toggle</button>
            ),
          },
        ]}
      />
    </div>
  );
}
