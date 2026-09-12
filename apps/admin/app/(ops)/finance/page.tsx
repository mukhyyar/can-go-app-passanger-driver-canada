'use client';

import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { money } from '../../../components/ui';

export default function FinancePage() {
  const [data, setData] = useState<{
    waterfall: Record<string, number>;
    counts: Record<string, number>;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ waterfall: Record<string, number>; counts: Record<string, number> }>('/admin/finance/overview')
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);
  return (
    <div>
      <h1 className="page-title">Finance overview</h1>
      <p className="page-sub">Gross booking → refunds → driver share → tax → CAN-RIDE net</p>
      {err && <p className="err">{err}</p>}
      <div className="kpis">
        {data &&
          Object.entries(data.waterfall).map(([k, v]) => (
            <div className="kpi" key={k}>
              <div className="label">{k}</div>
              <div className="value">{money(v)}</div>
            </div>
          ))}
      </div>
      <div className="panel" id="commission">
        <h3>Attempts</h3>
        {data && Object.entries(data.counts).map(([k, v]) => <div key={k}>{k}: {v}</div>)}
      </div>
      <div className="panel" id="recon" style={{ marginTop: 12 }}>
        <h3>Reconciliation</h3>
        <p className="muted">Succeeded payments minus refunds should match net after commission snapshot.</p>
      </div>
    </div>
  );
}
