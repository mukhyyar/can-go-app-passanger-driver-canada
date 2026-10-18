export function getDefaultSeatingCapacity(vehicleClass?: string | null): number {
  if (!vehicleClass) return 4;
  switch (vehicleClass.toLowerCase().trim()) {
    case 'suv_xl':
      return 7;
    case 'suv':
      return 6;
    case 'van':
    case 'minivan':
    case 'minivan (xxl)':
      return 7;
    case 'minibus':
    case 'mini bus':
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
