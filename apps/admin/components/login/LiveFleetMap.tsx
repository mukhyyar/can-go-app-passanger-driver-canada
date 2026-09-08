'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DEMO_VEHICLES,
  FLEET_MAP_CENTER,
  FLEET_MAP_ZOOM,
  FleetPosition,
  FleetVehicle,
  STATUS_COLORS,
  routeById,
} from '../../data/demoFleetRoutes';
import { useFleetAnimation, FleetAnimVehicle } from '../../hooks/useFleetAnimation';
import { carMarkerHtml } from './FleetVehicleMarker';
import { FleetStatusOverlay } from './FleetStatusOverlay';
import { VehicleTooltip } from './VehicleTooltip';

type LeafletMap = {
  remove: () => void;
  setView: (ll: [number, number], z: number) => LeafletMap;
  invalidateSize: () => void;
  on: (ev: string, fn: () => void) => void;
  off: (ev: string, fn: () => void) => void;
  dragging: { disable: () => void };
  touchZoom: { disable: () => void };
  doubleClickZoom: { disable: () => void };
  scrollWheelZoom: { disable: () => void };
  boxZoom: { disable: () => void };
  keyboard: { disable: () => void };
};
type LeafletMarker = {
  setLatLng: (ll: [number, number]) => void;
  setIcon: (icon: unknown) => void;
  addTo: (m: LeafletMap) => LeafletMarker;
  remove: () => void;
  on: (ev: string, fn: (e?: unknown) => void) => void;
  getElement: () => HTMLElement | undefined;
};
type LeafletLayer = { addTo: (m: LeafletMap) => LeafletLayer; remove: () => void };
type LeafletNS = {
  map: (el: HTMLElement, opts?: object) => LeafletMap;
  tileLayer: (url: string, opts: object) => { addTo: (m: LeafletMap) => void };
  divIcon: (opts: { className?: string; html?: string; iconSize?: [number, number]; iconAnchor?: [number, number] }) => unknown;
  marker: (ll: [number, number], opts?: object) => LeafletMarker;
  polyline: (ll: [number, number][], opts: object) => LeafletLayer;
  circleMarker: (ll: [number, number], opts: object) => LeafletLayer;
  Control?: { Attribution: new (opts?: object) => { addTo: (m: LeafletMap) => void; setPrefix: (s: string) => void } };
};

function leafletFromWindow(): LeafletNS | undefined {
  return (window as unknown as { L?: LeafletNS }).L;
}

function loadCss(href: string) {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = href;
  document.head.appendChild(l);
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if (leafletFromWindow()) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed ${src}`)), { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(s);
  });
}

async function ensureLeaflet(): Promise<LeafletNS | null> {
  const already = leafletFromWindow();
  if (already) return already;
  try {
    loadCss('/vendor/leaflet/leaflet.css');
    await loadScript('/vendor/leaflet/leaflet.js');
  } catch {
    return null;
  }
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    const L = leafletFromWindow();
    if (L) return L;
    await new Promise((r) => setTimeout(r, 40));
  }
  return leafletFromWindow() ?? null;
}

function applyHeading(marker: LeafletMarker, heading: number) {
  const el = marker.getElement();
  const inner = el?.querySelector('.fleet-car-marker') as HTMLElement | null;
  if (inner) inner.style.transform = `rotate(${heading}deg)`;
}

export function LiveFleetMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const LRef = useRef<LeafletNS | null>(null);
  const markersRef = useRef<Map<string, LeafletMarker>>(new Map());
  const positionsRef = useRef<Map<string, FleetPosition>>(new Map());
  const vehiclesRef = useRef<FleetAnimVehicle[]>([]);
  const [activeVehicles, setActiveVehicles] = useState<FleetVehicle[]>(DEMO_VEHICLES.slice(0, 12));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<FleetPosition | null>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const onVehicles = useCallback((vehicles: FleetAnimVehicle[]) => {
    vehiclesRef.current = vehicles;
    setActiveVehicles(vehicles);
  }, []);

  const onPositions = useCallback((positions: FleetPosition[]) => {
    for (const p of positions) {
      positionsRef.current.set(p.id, p);
      const marker = markersRef.current.get(p.id);
      if (marker) {
        marker.setLatLng([p.lat, p.lng]);
        applyHeading(marker, p.heading);
      }
    }
    // Intentionally no setState here — keep LoginPage free of per-frame renders.
  }, []);

  useFleetAnimation({ reducedMotion, onPositions, onVehicles });

  const hoverVehicle = useMemo(
    () => activeVehicles.find((v) => v.id === hoverId) ?? null,
    [activeVehicles, hoverId],
  );

  useEffect(() => {
    let cancelled = false;
    let map: LeafletMap | null = null;
    const tripLayers: LeafletLayer[] = [];

    async function boot() {
      if (!hostRef.current) return;
      const L = await ensureLeaflet();
      if (!L || cancelled || !hostRef.current) return;
      LRef.current = L;

      map = L.map(hostRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
      }).setView(FLEET_MAP_CENTER, FLEET_MAP_ZOOM);

      // Soft interactive feel without camera motion
      map.dragging.disable();
      map.touchZoom.disable();
      map.doubleClickZoom.disable();
      map.scrollWheelZoom.disable();
      map.boxZoom.disable();
      map.keyboard.disable();

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;
      setTimeout(() => map?.invalidateSize(), 80);
      setTimeout(() => map?.invalidateSize(), 320);
      setReady(true);
    }

    boot();
    return () => {
      cancelled = true;
      for (const layer of tripLayers) layer.remove();
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  // Create / sync markers when map ready or vehicle set changes
  useEffect(() => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map || !ready) return;

    const keep = new Set(activeVehicles.map((v) => v.id));
    for (const [id, marker] of markersRef.current) {
      if (!keep.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    // Trip polylines (1–2 red vehicles)
    const existingTrips = (map as unknown as { _fleetTrips?: LeafletLayer[] })._fleetTrips;
    if (existingTrips) {
      for (const layer of existingTrips) layer.remove();
    }
    const tripLayers: LeafletLayer[] = [];
    for (const v of activeVehicles) {
      if (!v.showTripPath || v.status !== 'trip') continue;
      const route = routeById(v.routeId);
      if (!route) continue;
      const line = L.polyline(route.points, {
        color: STATUS_COLORS.trip,
        weight: 2.5,
        opacity: 0.45,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'fleet-trip-line',
      }).addTo(map);
      tripLayers.push(line);
      const start = route.points[0];
      const end = route.points[Math.floor(route.points.length * 0.55)];
      tripLayers.push(
        L.circleMarker(start, {
          radius: 4,
          color: '#fff',
          weight: 1.5,
          fillColor: STATUS_COLORS.trip,
          fillOpacity: 0.95,
        }).addTo(map),
      );
      tripLayers.push(
        L.circleMarker(end, {
          radius: 4,
          color: '#fff',
          weight: 1.5,
          fillColor: '#1a1a1a',
          fillOpacity: 0.85,
        }).addTo(map),
      );
    }
    (map as unknown as { _fleetTrips?: LeafletLayer[] })._fleetTrips = tripLayers;

    for (const v of activeVehicles) {
      if (markersRef.current.has(v.id)) continue;
      const pos = positionsRef.current.get(v.id);
      const ll: [number, number] = pos ? [pos.lat, pos.lng] : v.parkedAt ?? routeById(v.routeId)?.points[0] ?? FLEET_MAP_CENTER;
      const size = 32;
      const icon = L.divIcon({
        className: 'fleet-leaflet-icon',
        html: carMarkerHtml(v.status, size),
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
      });
      const marker = L.marker(ll, { icon, interactive: true, keyboard: false }).addTo(map);
      marker.on('mouseover', () => {
        setHoverId(v.id);
        setHoverPos(positionsRef.current.get(v.id) ?? null);
      });
      marker.on('mouseout', () => {
        setHoverId(null);
        setHoverPos(null);
      });
      if (pos) applyHeading(marker, pos.heading);
      markersRef.current.set(v.id, marker);
    }
  }, [activeVehicles, ready]);

  // Keep map sized with container
  useEffect(() => {
    const map = mapRef.current;
    const el = hostRef.current;
    if (!map || !el) return;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  return (
    <div className="fleet-stage fleet-stage--live">
      <div ref={hostRef} className="fleet-leaflet-host" />
      <FleetStatusOverlay vehicles={activeVehicles} />
      {hoverVehicle && (
        <div className="fleet-tooltip-anchor">
          <VehicleTooltip vehicle={hoverVehicle} position={hoverPos} />
        </div>
      )}
      <div className="fleet-map-fade" aria-hidden />
    </div>
  );
}
