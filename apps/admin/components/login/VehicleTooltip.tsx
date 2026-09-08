'use client';

import { FleetPosition, FleetVehicle, statusLabel } from '../../data/demoFleetRoutes';

export function VehicleTooltip({
  vehicle,
  position,
}: {
  vehicle: FleetVehicle;
  position: FleetPosition | null;
}) {
  const detail =
    vehicle.status === 'trip'
      ? `Trip · ${position?.speedKmh ?? 0} km/h`
      : vehicle.status === 'pending'
        ? vehicle.speedMps === 0 || vehicle.parkedAt
          ? 'Parked · KYC pending'
          : `Slow crawl · KYC`
        : `Available · ${position?.speedKmh ?? 0} km/h`;

  return (
    <div className="fleet-tooltip" role="tooltip">
      <strong>{vehicle.code}</strong>
      <span>{vehicle.model}</span>
      <span>{vehicle.driver}</span>
      <span className={`fleet-tip-status ${vehicle.status}`}>{statusLabel(vehicle.status)}</span>
      <span className="fleet-tip-meta">{detail}</span>
    </div>
  );
}
