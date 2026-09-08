'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import { Chip, statusTone } from '../../../components/ui';

export default function HealthPage() {
  const [h, setH] = useState<Record<string, { status?: string; name?: string }>>({});
  useEffect(() => { api('/admin/platform/health').then((d) => setH(d as typeof h)).catch(() => undefined); }, []);
  return (
    <div>
      <h1 className="page-title">System health</h1>
      <div className="health-grid" id="integrations">
        {Object.entries(h).filter(([, v]) => v && typeof v === 'object' && 'status' in v).map(([k, v]) => (
          <div className="panel" key={k}>
            <div className="muted">{k}</div>
            <Chip tone={statusTone(v.status)}>{v.status} {v.name ?? ''}</Chip>
          </div>
        ))}
      </div>
    </div>
  );
}
