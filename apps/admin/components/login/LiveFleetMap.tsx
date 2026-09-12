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
import {
  createHtmlMarker,
  googleMapsApiKey,
  loadGoogleMaps,
  type GMap,
  type GOverlay,
} from '../../lib/google-maps-loader';

type HtmlMarker = ReturnType<typeof createHtmlMarker>;

export function LiveFleetMap() {
  const hostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const markersRef = useRef<Map<string, HtmlMarker>>(new Map());
  const tripLayersRef = useRef<GOverlay[]>([]);
  const positionsRef = useRef<Map<string, FleetPosition>>(new Map());
  const [activeVehicles, setActiveVehicles] = useState<FleetVehicle[]>(DEMO_VEHICLES.slice(0, 12));
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<FleetPosition | null>(null);
  const [ready, setReady] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const onVehicles = useCallback((vehicles: FleetAnimVehicle[]) => {
    setActiveVehicles(vehicles);
  }, []);

  const onPositions = useCallback((positions: FleetPosition[]) => {
    for (const p of positions) {
      positionsRef.current.set(p.id, p);
      const marker = markersRef.current.get(p.id);
      if (marker) {
        marker.setPosition({ lat: p.lat, lng: p.lng });
        marker.setHeading(p.heading);
      }
    }
  }, []);

  useFleetAnimation({ reducedMotion, onPositions, onVehicles });

  const hoverVehicle = useMemo(
    () => activeVehicles.find((v) => v.id === hoverId) ?? null,
    [activeVehicles, hoverId],
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      if (!hostRef.current) return;
      if (!googleMapsApiKey()) {
        setError('Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
        return;
      }
      const g = await loadGoogleMaps();
      if (!g || cancelled || !hostRef.current) {
        if (!cancelled) setError('Google Maps failed to load');
        return;
      }

      const map = new g.Map(hostRef.current, {
        center: { lat: FLEET_MAP_CENTER[0], lng: FLEET_MAP_CENTER[1] },
        zoom: FLEET_MAP_ZOOM,
        disableDefaultUI: true,
        gestureHandling: 'none',
        keyboardShortcuts: false,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControl: false,
      });
      mapRef.current = map;
      setReady(true);
      setError(null);
    }

    void boot();
    return () => {
      cancelled = true;
      for (const layer of tripLayersRef.current) layer.setMap(null);
      tripLayersRef.current = [];
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      mapRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !window.google?.maps) return;
    const g = window.google.maps;

    for (const layer of tripLayersRef.current) layer.setMap(null);
    tripLayersRef.current = [];

    for (const v of activeVehicles) {
      if (!v.showTripPath || v.status !== 'trip') continue;
      const route = routeById(v.routeId);
      if (!route) continue;
      const path = route.points.map(([lat, lng]) => ({ lat, lng }));
      tripLayersRef.current.push(
        new g.Polyline({
          map,
          path,
          strokeColor: STATUS_COLORS.trip,
          strokeWeight: 2.5,
          strokeOpacity: 0.45,
        }),
      );
      const start = path[0];
      const end = path[Math.floor(path.length * 0.55)];
      if (start) {
        tripLayersRef.current.push(
          new g.Circle({
            map,
            center: start,
            radius: 35,
            strokeColor: '#fff',
            strokeWeight: 1.5,
            fillColor: STATUS_COLORS.trip,
            fillOpacity: 0.95,
          }),
        );
      }
      if (end) {
        tripLayersRef.current.push(
          new g.Circle({
            map,
            center: end,
            radius: 35,
            strokeColor: '#fff',
            strokeWeight: 1.5,
            fillColor: '#1a1a1a',
            fillOpacity: 0.85,
          }),
        );
      }
    }

    const keep = new Set(activeVehicles.map((v) => v.id));
    for (const [id, marker] of markersRef.current) {
      if (!keep.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const v of activeVehicles) {
      if (markersRef.current.has(v.id)) continue;
      const pos = positionsRef.current.get(v.id);
      const ll = pos
        ? { lat: pos.lat, lng: pos.lng }
        : v.parkedAt
          ? { lat: v.parkedAt[0], lng: v.parkedAt[1] }
          : (() => {
              const p = routeById(v.routeId)?.points[0] ?? FLEET_MAP_CENTER;
              return { lat: p[0], lng: p[1] };
            })();
      const size = 32;
      const marker = createHtmlMarker(g, map, ll, carMarkerHtml(v.status, size), size);
      marker.addListener('mouseover', () => {
        setHoverId(v.id);
        setHoverPos(positionsRef.current.get(v.id) ?? null);
      });
      marker.addListener('mouseout', () => {
        setHoverId(null);
        setHoverPos(null);
      });
      if (pos) marker.setHeading(pos.heading);
      markersRef.current.set(v.id, marker);
    }
  }, [activeVehicles, ready]);

  return (
    <div className="fleet-stage fleet-stage--live">
      <div ref={hostRef} className="gmaps-host fleet-gmaps-host" />
      {error && (
        <p className="radar-empty" style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
          {error}
        </p>
      )}
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
