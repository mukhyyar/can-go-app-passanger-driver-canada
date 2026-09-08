'use client';

import { fleetCounts, FleetVehicle, statusLabel } from '../../data/demoFleetRoutes';

export function FleetStatusOverlay({ vehicles }: { vehicles: FleetVehicle[] }) {
  const counts = fleetCounts(vehicles);
  return (
    <div className="fleet-live-overlay" aria-live="polite">
      <div className="fleet-live-title">
        <span className="fleet-live-pulse" />
        Live fleet
      </div>
      <div className="fleet-live-online">{counts.total} vehicles online</div>
      <ul className="fleet-live-counts">
        <li>
          <span className="fleet-dot ok" />
          {counts.available} {statusLabel('available')}
        </li>
        <li>
          <span className="fleet-dot trip" />
          {counts.trip} {statusLabel('trip')}
        </li>
        <li>
          <span className="fleet-dot pending" />
          {counts.pending} {statusLabel('pending')}
        </li>
      </ul>
    </div>
  );
}
