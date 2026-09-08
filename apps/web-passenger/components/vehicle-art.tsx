import { vehicleImage } from '../lib/vehicles';

export function VehiclePhoto({
  id,
  name,
}: {
  id: string;
  name?: string;
}) {
  return (
    <img
      className="car"
      src={vehicleImage(id)}
      alt={name ? `${name} class` : ''}
      width={160}
      height={90}
    />
  );
}
