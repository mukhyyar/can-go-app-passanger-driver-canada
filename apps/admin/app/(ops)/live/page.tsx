'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '../../../lib/api';
import { Chip } from '../../../components/ui';
import { FleetMap } from '../../../components/fleet-map';

export default function LiveOps() {
  const [live, setLive] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    api<{ live: Record<string, number> }>('/admin/dashboard/kpis?range=today')
      .then((d) => setLive(d.live))
      .catch(() => undefined);
  }, []);
  return (
    <div>
      <h1 className="page-title">Live Operations</h1>
      <p className="page-sub">Fleet including vehicles still pending registration · Google Maps</p>
      <div className="kpis">
        {live &&
          Object.entries(live).map(([k, v]) => (
            <div className="kpi" key={k}>
              <div className="label">{k}</div>
              <div className="value">
                <Chip>{v}</Chip>
              </div>
            </div>
          ))}
      </div>
      <p className="muted" style={{ marginBottom: 12 }}>
        <Link href="/map">Open full live map</Link>
      </p>
      <FleetMap title="" compact />
    </div>
  );
}
