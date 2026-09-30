export function getDefaultSeatingCapacity(vehicleClass?: string | null): number {
  if (!vehicleClass) return 4;
  switch (vehicleClass.toLowerCase().trim()) {
    case 'suv':
      return 6;
    case 'van':
    case 'minivan':
      return 7;
    case 'minibus':
    case 'bus':
      return 16;
    case 'sedan':
    case 'economy':
    case 'comfort':
    case 'business':
    case 'vip':
    default:
      return 4;
  }
}
