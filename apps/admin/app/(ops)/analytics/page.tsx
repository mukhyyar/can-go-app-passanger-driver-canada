'use client';

import { Suspense } from 'react';
import { AnalyticsWorkspace } from '../../../components/analytics/workspace';

export default function AnalyticsPage() {
  return (
    <Suspense fallback={<p className="muted">Loading analytics…</p>}>
      <AnalyticsWorkspace />
    </Suspense>
  );
}
