'use client';
import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
export default function Page() {
  const [g, setG] = useState<Record<string, unknown> | null>(null);
  useEffect(() => { api('/admin/growth').then((d) => setG(d as Record<string, unknown>)).catch(() => undefined); }, []);
  return (
    <div>
      <h1 className="page-title">Retention & growth</h1>
      <pre className="panel" style={{ overflow: 'auto' }}>{JSON.stringify(g, null, 2)}</pre>
    </div>
  );
}
