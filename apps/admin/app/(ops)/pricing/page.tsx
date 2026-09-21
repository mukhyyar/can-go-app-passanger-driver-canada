'use client';

import { useEffect, useState } from 'react';
import { api, hasPermission } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { DataGrid } from '../../../components/data-grid';

type FareRow = Record<string, unknown>;

const EMPTY_NEW = {
  serviceType: 'RIDE',
  vehicleClass: '*',
  currency: 'CAD',
  baseFare: '8',
  perKm: '1.4',
  perMinute: '0.25',
  perHour: '0',
  minFare: '12',
  minBidMultiplier: '0.8',
  maxBidMultiplier: '1.5',
  platformCommissionPct: '15',
  taxPct: '0',
  isActive: true,
};

function payloadFromRow(row: FareRow) {
  return {
    serviceType: String(row.serviceType ?? 'RIDE'),
    vehicleClass: String(row.vehicleClass ?? '*'),
    currency: String(row.currency ?? 'CAD'),
    baseFare: Number(row.baseFare),
    perKm: Number(row.perKm),
    perMinute: Number(row.perMinute),
    perHour: Number(row.perHour ?? 0),
    minFare: Number(row.minFare),
    minBidMultiplier: Number(row.minBidMultiplier ?? 0.8),
    maxBidMultiplier: Number(row.maxBidMultiplier ?? 1.5),
    platformCommissionPct: Number(row.platformCommissionPct ?? 15),
    taxPct: Number(row.taxPct ?? 0),
    isActive: row.isActive !== false && row.isActive !== 'false',
  };
}

function EditableNumber({
  row,
  field,
  disabled,
  width = 72,
}: {
  row: FareRow;
  field: string;
  disabled: boolean;
  width?: number;
}) {
  return (
    <input
      className="field"
      style={{ margin: 0, width }}
      defaultValue={String(row[field] ?? '')}
      disabled={disabled}
      onBlur={(e) => {
        row[field] = e.target.value;
      }}
    />
  );
}

function EditableText({
  row,
  field,
  disabled,
  width = 88,
}: {
  row: FareRow;
  field: string;
  disabled: boolean;
  width?: number;
}) {
  return (
    <input
      className="field"
      style={{ margin: 0, width }}
      defaultValue={String(row[field] ?? '')}
      disabled={disabled}
      onBlur={(e) => {
        row[field] = e.target.value;
      }}
    />
  );
}

export default function PricingPage() {
  const { me } = useAuth();
  const canEdit = hasPermission(me?.permissions, 'pricing.edit');
  const [rows, setRows] = useState<FareRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newRule, setNewRule] = useState(EMPTY_NEW);

  function load() {
    setLoading(true);
    setErr(null);
    api<FareRow[]>('/admin/fare-rules')
      .then(setRows)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function save(row: FareRow) {
    setSaving(true);
    setErr(null);
    try {
      await api(`/admin/fare-rules/${row.id}`, {
        method: 'PUT',
        body: JSON.stringify(payloadFromRow(row)),
      });
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function create() {
    setSaving(true);
    setErr(null);
    try {
      await api('/admin/fare-rules', {
        method: 'PUT',
        body: JSON.stringify(payloadFromRow(newRule as FareRow)),
      });
      setNewRule(EMPTY_NEW);
      load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 className="page-title">Fare rules</h1>
      <p className="page-sub" id="services">
        Service types, vehicle classes, CAD rates, bid bounds, commission, taxes
      </p>
      {!canEdit && <p className="muted">Read-only — pricing.edit required to save.</p>}
      <DataGrid
        rows={rows}
        loading={loading}
        error={err}
        persistKey="fare-rules"
        onRefresh={load}
        toolbar={
          canEdit ? (
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              <input
                className="field"
                style={{ width: 100, margin: 0 }}
                placeholder="Service"
                value={newRule.serviceType}
                onChange={(e) => setNewRule({ ...newRule, serviceType: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 80, margin: 0 }}
                placeholder="Class"
                value={newRule.vehicleClass}
                onChange={(e) => setNewRule({ ...newRule, vehicleClass: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 64, margin: 0 }}
                placeholder="CCY"
                value={newRule.currency}
                onChange={(e) => setNewRule({ ...newRule, currency: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 64, margin: 0 }}
                placeholder="Base"
                value={newRule.baseFare}
                onChange={(e) => setNewRule({ ...newRule, baseFare: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 64, margin: 0 }}
                placeholder="Per km"
                value={newRule.perKm}
                onChange={(e) => setNewRule({ ...newRule, perKm: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 64, margin: 0 }}
                placeholder="Per min"
                value={newRule.perMinute}
                onChange={(e) => setNewRule({ ...newRule, perMinute: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 64, margin: 0 }}
                placeholder="Per hr"
                value={newRule.perHour}
                onChange={(e) => setNewRule({ ...newRule, perHour: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 64, margin: 0 }}
                placeholder="Min"
                value={newRule.minFare}
                onChange={(e) => setNewRule({ ...newRule, minFare: e.target.value })}
              />
              <input
                className="field"
                style={{ width: 56, margin: 0 }}
                placeholder="Comm %"
                value={newRule.platformCommissionPct}
                onChange={(e) =>
                  setNewRule({ ...newRule, platformCommissionPct: e.target.value })
                }
              />
              <input
                className="field"
                style={{ width: 56, margin: 0 }}
                placeholder="Tax %"
                value={newRule.taxPct}
                onChange={(e) => setNewRule({ ...newRule, taxPct: e.target.value })}
              />
              <button className="btn sm" disabled={saving} onClick={create}>
                Add rule
              </button>
            </div>
          ) : null
        }
        columns={[
          {
            key: 'serviceType',
            label: 'Service',
            type: 'enum',
            render: (r) => <EditableText row={r} field="serviceType" disabled={!canEdit} />,
          },
          {
            key: 'vehicleClass',
            label: 'Class',
            type: 'enum',
            render: (r) => (
              <EditableText row={r} field="vehicleClass" disabled={!canEdit} width={72} />
            ),
          },
          {
            key: 'currency',
            label: 'CCY',
            type: 'enum',
            render: (r) => (
              <EditableText row={r} field="currency" disabled={!canEdit} width={56} />
            ),
          },
          {
            key: 'baseFare',
            label: 'Base',
            type: 'number',
            align: 'right',
            render: (r) => <EditableNumber row={r} field="baseFare" disabled={!canEdit} />,
          },
          {
            key: 'perKm',
            label: 'Per km',
            type: 'number',
            align: 'right',
            render: (r) => <EditableNumber row={r} field="perKm" disabled={!canEdit} />,
          },
          {
            key: 'perMinute',
            label: 'Per min',
            type: 'number',
            align: 'right',
            render: (r) => <EditableNumber row={r} field="perMinute" disabled={!canEdit} />,
          },
          {
            key: 'perHour',
            label: 'Per hr',
            type: 'number',
            align: 'right',
            render: (r) => <EditableNumber row={r} field="perHour" disabled={!canEdit} />,
          },
          {
            key: 'minFare',
            label: 'Min',
            type: 'number',
            align: 'right',
            render: (r) => <EditableNumber row={r} field="minFare" disabled={!canEdit} />,
          },
          {
            key: 'minBidMultiplier',
            label: 'Min bid ×',
            type: 'number',
            align: 'right',
            render: (r) => (
              <EditableNumber row={r} field="minBidMultiplier" disabled={!canEdit} width={64} />
            ),
          },
          {
            key: 'maxBidMultiplier',
            label: 'Max bid ×',
            type: 'number',
            align: 'right',
            render: (r) => (
              <EditableNumber row={r} field="maxBidMultiplier" disabled={!canEdit} width={64} />
            ),
          },
          {
            key: 'platformCommissionPct',
            label: 'Comm %',
            type: 'number',
            align: 'right',
            render: (r) => (
              <EditableNumber
                row={r}
                field="platformCommissionPct"
                disabled={!canEdit}
                width={56}
              />
            ),
          },
          {
            key: 'taxPct',
            label: 'Tax %',
            type: 'number',
            align: 'right',
            render: (r) => <EditableNumber row={r} field="taxPct" disabled={!canEdit} width={56} />,
          },
          {
            key: 'isActive',
            label: 'Active',
            type: 'boolean',
            render: (r) =>
              canEdit ? (
                <input
                  type="checkbox"
                  defaultChecked={r.isActive !== false}
                  onChange={(e) => {
                    r.isActive = e.target.checked;
                  }}
                />
              ) : (
                String(r.isActive !== false)
              ),
          },
          {
            key: 'act',
            label: '',
            filterable: false,
            sortable: false,
            render: (r) =>
              canEdit ? (
                <button className="btn sm" disabled={saving} onClick={() => save(r)}>
                  Save
                </button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}
