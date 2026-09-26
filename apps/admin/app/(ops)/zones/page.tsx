'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, hasPermission } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { OperatingZonesWorkspace } from '../../../components/operating-zones-workspace';
import type { OperatingZoneRow } from '../../../lib/operating-zone-geo';

export default function Page() {
  const { me } = useAuth();
  const canEdit = hasPermission(me?.permissions, 'kyc.edit');
  const [zones, setZones] = useState<OperatingZoneRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await api<OperatingZoneRow[]>('/admin/zones');
      setZones(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load zones');
      setZones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 className="page-title">Operating zones</h1>
          <p className="muted" style={{ margin: 0 }}>
            Where each driver covers rides — view shapes on the map
            {canEdit ? '; edit or delete with KYC edit permission' : ''}.
          </p>
        </div>
        <button type="button" className="btn ghost sm" onClick={() => void load()} disabled={loading}>
          Refresh
        </button>
      </div>

      {error ? (
        <div className="panel" style={{ marginBottom: 12 }}>
          <p className="muted" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      ) : null}

      {loading && zones.length === 0 ? (
        <div className="panel">
          <p className="muted">Loading zones…</p>
        </div>
      ) : (
        <OperatingZonesWorkspace zones={zones} canEdit={canEdit} onChanged={load} />
      )}
    </div>
  );
}
