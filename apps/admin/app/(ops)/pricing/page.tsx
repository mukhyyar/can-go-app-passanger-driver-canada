'use client';

import { useEffect, useState } from 'react';
import { api, hasPermission } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { DataGrid } from '../../../components/data-grid';

export default function PricingPage() {
  const { me } = useAuth();
  const canEdit = hasPermission(me?.permissions, 'pricing.edit');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<Array<Record<string, unknown>>>('/admin/fare-rules')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);
  async function save(row: Record<string, unknown>) {
    await api(`/admin/fare-rules/${row.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        serviceType: row.serviceType,
        vehicleClass: row.vehicleClass,
        currency: row.currency,
        baseFare: Number(row.baseFare),
        perKm: Number(row.perKm),
        perMinute: Number(row.perMinute),
        perHour: Number(row.perHour ?? 0),
        minFare: Number(row.minFare),
        minBidMultiplier: Number(row.minBidMultiplier),
        maxBidMultiplier: Number(row.maxBidMultiplier),
        platformCommissionPct: Number(row.platformCommissionPct),
        taxPct: Number(row.taxPct),
        isActive: row.isActive,
      }),
    });
  }
  return (
    <div>
      <h1 className="page-title">Fare rules</h1>
      <p className="page-sub" id="services">Service types, bid bounds, commission, taxes</p>
      {!canEdit && <p className="muted">Read-only — pricing.edit required to save.</p>}
      <DataGrid
        rows={rows}
        loading={loading}
        error={err}
        persistKey="fare-rules"
        columns={[
          { key: 'serviceType', label: 'Service', type: 'enum' },
          { key: 'vehicleClass', label: 'Class', type: 'enum' },
          {
            key: 'baseFare',
            label: 'Base',
            type: 'number',
            align: 'right',
            render: (r) => (
              <input className="field" style={{ margin: 0 }} defaultValue={String(r.baseFare)} disabled={!canEdit} onBlur={(e) => { r.baseFare = e.target.value; }} />
            ),
          },
          {
            key: 'perKm',
            label: 'Per km',
            type: 'number',
            align: 'right',
            render: (r) => (
              <input className="field" style={{ margin: 0 }} defaultValue={String(r.perKm)} disabled={!canEdit} onBlur={(e) => { r.perKm = e.target.value; }} />
            ),
          },
          { key: 'minFare', label: 'Min', type: 'number', align: 'right' },
          { key: 'platformCommissionPct', label: 'Comm %', type: 'number', align: 'right' },
          { key: 'taxPct', label: 'Tax %', type: 'number', align: 'right' },
          {
            key: 'act',
            label: '',
            filterable: false,
            sortable: false,
            render: (r) => canEdit ? <button className="btn sm" onClick={() => save(r)}>Save</button> : null,
          },
        ]}
      />
    </div>
  );
}
