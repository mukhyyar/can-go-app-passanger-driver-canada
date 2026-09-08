'use client';

import { FleetMap } from '../../../components/fleet-map';

export default function LiveMapPage({ title = 'Live map' }: { title?: string }) {
  return <FleetMap title={title} />;
}
