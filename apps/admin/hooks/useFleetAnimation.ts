'use client';

import { useEffect, useRef } from 'react';
import {
  DEMO_VEHICLES,
  FleetPosition,
  FleetRoute,
  FleetVehicle,
  LatLng,
  routeById,
} from '../data/demoFleetRoutes';

const EARTH_R = 6371000;

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

function toDeg(r: number) {
  return (r * 180) / Math.PI;
}

function haversineM(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const dLng = toRad(b[1] - a[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function lerpAngle(from: number, to: number, t: number): number {
  let diff = ((to - from + 540) % 360) - 180;
  return (from + diff * t + 360) % 360;
}

type SegCache = {
  points: LatLng[];
  cum: number[];
  total: number;
  loop: boolean;
};

function buildSegCache(route: FleetRoute): SegCache {
  const points = route.points;
  const cum = [0];
  for (let i = 1; i < points.length; i++) {
    cum.push(cum[i - 1] + haversineM(points[i - 1], points[i]));
  }
  let total = cum[cum.length - 1];
  if (route.loop && points.length > 1) {
    total += haversineM(points[points.length - 1], points[0]);
  }
  return { points, cum, total: Math.max(total, 1), loop: route.loop };
}

function sampleRoute(cache: SegCache, distanceM: number): { ll: LatLng; heading: number } {
  const d = cache.loop
    ? ((distanceM % cache.total) + cache.total) % cache.total
    : Math.min(Math.max(distanceM, 0), cache.total);

  const pts = cache.points;
  // Along polyline
  for (let i = 1; i < pts.length; i++) {
    if (d <= cache.cum[i]) {
      const segLen = cache.cum[i] - cache.cum[i - 1] || 1;
      const t = (d - cache.cum[i - 1]) / segLen;
      const a = pts[i - 1];
      const b = pts[i];
      return {
        ll: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
        heading: bearingDeg(a, b),
      };
    }
  }
  // Closing loop segment
  if (cache.loop) {
    const a = pts[pts.length - 1];
    const b = pts[0];
    const start = cache.cum[cache.cum.length - 1];
    const segLen = cache.total - start || 1;
    const t = (d - start) / segLen;
    return {
      ll: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
      heading: bearingDeg(a, b),
    };
  }
  const last = pts[pts.length - 1];
  const prev = pts[Math.max(0, pts.length - 2)];
  return { ll: last, heading: bearingDeg(prev, last) };
}

export type FleetAnimVehicle = FleetVehicle & { route: FleetRoute };

function selectVehicles(max: number): FleetAnimVehicle[] {
  const ordered = [...DEMO_VEHICLES];
  // Prefer keeping mix: trips + parked + movers
  const picked = ordered.slice(0, Math.min(max, ordered.length));
  return picked
    .map((v) => {
      const route = routeById(v.routeId);
      return route ? { ...v, route } : null;
    })
    .filter((v): v is FleetAnimVehicle => !!v);
}

function vehicleBudget(): number {
  if (typeof window === 'undefined') return 12;
  const w = window.innerWidth;
  if (w < 640) return 5;
  if (w < 900) return 8;
  return 12;
}

export type UseFleetAnimationOpts = {
  reducedMotion: boolean;
  onPositions?: (positions: FleetPosition[]) => void;
  /** Called once with the active vehicle set. */
  onVehicles?: (vehicles: FleetAnimVehicle[]) => void;
};

/**
 * Single rAF loop. Mutates positions via callback; does not set React state every frame.
 * Callers should apply DOM updates from refs.
 */
export function useFleetAnimation({
  reducedMotion,
  onPositions,
  onVehicles,
}: UseFleetAnimationOpts) {
  const vehiclesRef = useRef<FleetAnimVehicle[]>([]);
  const cachesRef = useRef<Map<string, SegCache>>(new Map());
  const headingsRef = useRef<Map<string, number>>(new Map());
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const onPosRef = useRef(onPositions);
  const onVehRef = useRef(onVehicles);
  onPosRef.current = onPositions;
  onVehRef.current = onVehicles;

  useEffect(() => {
    const budget = vehicleBudget();
    const vehicles = selectVehicles(budget);
    vehiclesRef.current = vehicles;
    const caches = new Map<string, SegCache>();
    for (const v of vehicles) {
      if (!caches.has(v.route.id)) caches.set(v.route.id, buildSegCache(v.route));
    }
    cachesRef.current = caches;
    onVehRef.current?.(vehicles);

    const compute = (elapsedSec: number): FleetPosition[] => {
      return vehicles.map((v) => {
        if (v.parkedAt) {
          return {
            id: v.id,
            lat: v.parkedAt[0],
            lng: v.parkedAt[1],
            heading: v.parkedHeading ?? 0,
            speedKmh: 0,
            status: v.status,
          };
        }
        const cache = caches.get(v.route.id)!;
        const speed = reducedMotion ? 0 : v.speedMps;
        const dist = v.phase * cache.total + elapsedSec * speed;
        const { ll, heading: rawHeading } = sampleRoute(cache, dist);
        const prev = headingsRef.current.get(v.id) ?? rawHeading;
        const heading = reducedMotion || speed === 0 ? rawHeading : lerpAngle(prev, rawHeading, 0.18);
        headingsRef.current.set(v.id, heading);
        return {
          id: v.id,
          lat: ll[0],
          lng: ll[1],
          heading,
          speedKmh: Math.round(speed * 3.6),
          status: v.status,
        };
      });
    };

    // Initial paint
    const initial = compute(0);
    onPosRef.current?.(initial);

    if (reducedMotion) {
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
      };
    }

    startRef.current = performance.now();
    const tick = (now: number) => {
      const elapsedSec = (now - startRef.current) / 1000;
      onPosRef.current?.(compute(elapsedSec));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const onResize = () => {
      // Budget is fixed for session to avoid marker churn; no-op.
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reducedMotion]);

  return { vehiclesRef };
}
