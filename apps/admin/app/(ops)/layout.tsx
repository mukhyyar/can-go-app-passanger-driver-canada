'use client';

import { Suspense } from 'react';
import { Shell } from '../../components/shell';

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
