export type OperatingZoneDriver = {
  id: string;
  userId: string;
  fullName: string;
  baseLocation?: string;
  approvalStatus?: string;
};

export type OperatingZoneRow = {
  id: string;
  name: string;
  zoneType: string;
  geoJson: Record<string, unknown> | null;
  radiusKm: number | null;
  driverId: string;
  createdAt?: string;
  updatedAt?: string;
  driver?: OperatingZoneDriver | null;
};

export type ZoneCircle = {
  kind: 'circle';
  center: { lat: number; lng: number };
  radiusKm: number;
};

export type ZonePolygon = {
  kind: 'polygon';
  paths: Array<{ lat: number; lng: number }>;
};

export type ParsedZoneGeom = ZoneCircle | ZonePolygon;

function asNum(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** GeoJSON rings are [lng, lat]; Google Maps wants {lat,lng}. */
export function parseZoneGeom(zone: {
  zoneType: string;
  geoJson: Record<string, unknown> | null;
  radiusKm?: number | null;
}): ParsedZoneGeom | null {
  const g = zone.geoJson;
  if (!g || typeof g !== 'object') return null;

  if (zone.zoneType === 'circle') {
    const centerRaw = g.center;
    const radius =
      asNum(zone.radiusKm) ?? asNum(g.radiusKm) ?? null;
    if (!Array.isArray(centerRaw) || centerRaw.length < 2 || !radius || radius <= 0) {
      return null;
    }
    const lng = asNum(centerRaw[0]);
    const lat = asNum(centerRaw[1]);
    if (lat == null || lng == null) return null;
    return { kind: 'circle', center: { lat, lng }, radiusKm: radius };
  }

  const geom =
    g.type === 'Feature'
      ? (g.geometry as { type?: string; coordinates?: unknown } | undefined)
      : (g as { type?: string; coordinates?: unknown });
  if (!geom) return null;

  if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
    const ring = geom.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const paths: Array<{ lat: number; lng: number }> = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = asNum(pt[0]);
      const lat = asNum(pt[1]);
      if (lat == null || lng == null) continue;
      paths.push({ lat, lng });
    }
    if (paths.length < 3) return null;
    return { kind: 'polygon', paths };
  }

  if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
    const first = geom.coordinates[0];
    const ring = Array.isArray(first) ? first[0] : null;
    if (!Array.isArray(ring) || ring.length < 3) return null;
    const paths: Array<{ lat: number; lng: number }> = [];
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      const lng = asNum(pt[0]);
      const lat = asNum(pt[1]);
      if (lat == null || lng == null) continue;
      paths.push({ lat, lng });
    }
    if (paths.length < 3) return null;
    return { kind: 'polygon', paths };
  }

  return null;
}

export function circlePayload(
  name: string,
  center: { lat: number; lng: number },
  radiusKm: number,
) {
  return {
    name,
    zoneType: 'circle' as const,
    geoJson: { center: [center.lng, center.lat], radiusKm },
    radiusKm,
  };
}

export function polygonPayload(
  name: string,
  paths: Array<{ lat: number; lng: number }>,
) {
  const ring = paths.map((p) => [p.lng, p.lat]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (
    first &&
    last &&
    (first[0] !== last[0] || first[1] !== last[1])
  ) {
    ring.push([...first]);
  }
  return {
    name,
    zoneType: 'polygon' as const,
    geoJson: { type: 'Polygon', coordinates: [ring] },
  };
}
