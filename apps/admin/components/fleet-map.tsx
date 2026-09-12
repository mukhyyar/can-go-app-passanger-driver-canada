'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import {
  googleMapsApiKey,
  loadGoogleMaps,
  type GMap,
  type GMapsNS,
  type GOverlay,
} from '../lib/google-maps-loader';

export type MapData = {
  drivers: Array<{
    lat: number;
    lng: number;
    live?: boolean;
    unregistered?: boolean;
    hasGps?: boolean;
    driver: {
      id: string;
      fullName: string;
      isActivated?: boolean;
      approvalStatus?: string;
      plate?: string;
    };
  }>;
  trips: Array<{
    id: string;
    fromLat: number;
    fromLng: number;
    toLat?: number;
    toLng?: number;
    status: string;
  }>;
  waiting: Array<{ id: string; fromLat: number; fromLng: number; fromLabel?: string }>;
};

function pinColor(d: MapData['drivers'][number]) {
  if (d.unregistered || d.driver.approvalStatus === 'PENDING_KYC' || !d.driver.isActivated)
    return '#f59e0b';
  if (d.live === false) return '#9e9e9e';
  return '#2ea44f';
}

function pinLabel(d: MapData['drivers'][number]) {
  if (d.unregistered || d.driver.approvalStatus === 'PENDING_KYC' || !d.driver.isActivated) {
    return d.hasGps === false ? 'Pending registration · city estimate' : 'Pending registration / KYC';
  }
  return d.live === false ? 'Stale ping' : 'Live';
}

export function FleetMap({
  title = 'Live fleet',
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const overlaysRef = useRef<GOverlay[]>([]);
  const [data, setData] = useState<MapData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    async function paint(g: GMapsNS, payload: MapData) {
      if (cancelled || !host.current) return;
      if (!mapRef.current) {
        mapRef.current = new g.Map(host.current, {
          center: { lat: 43.83, lng: -79.54 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      }
      const map = mapRef.current;
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];

      const bounds = new g.LatLngBounds();
      let hasPoint = false;

      for (const d of payload.drivers ?? []) {
        if (!Number.isFinite(d.lat) || !Number.isFinite(d.lng)) continue;
        overlaysRef.current.push(
          new g.Marker({
            map,
            position: { lat: d.lat, lng: d.lng },
            title: `${d.driver.fullName} · ${pinLabel(d)}`,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 7,
              fillColor: pinColor(d),
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          }),
        );
        bounds.extend({ lat: d.lat, lng: d.lng });
        hasPoint = true;
      }

      for (const t of payload.trips ?? []) {
        if (!Number.isFinite(t.fromLat) || !Number.isFinite(t.fromLng)) continue;
        overlaysRef.current.push(
          new g.Marker({
            map,
            position: { lat: t.fromLat, lng: t.fromLng },
            title: `Trip ${t.status}`,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#e50000',
              fillOpacity: 0.95,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          }),
        );
        bounds.extend({ lat: t.fromLat, lng: t.fromLng });
        hasPoint = true;
      }

      for (const w of payload.waiting ?? []) {
        if (!Number.isFinite(w.fromLat) || !Number.isFinite(w.fromLng)) continue;
        overlaysRef.current.push(
          new g.Marker({
            map,
            position: { lat: w.fromLat, lng: w.fromLng },
            title: `Waiting ${w.fromLabel ?? w.id}`,
            icon: {
              path: g.SymbolPath.CIRCLE,
              scale: 6,
              fillColor: '#1d4ed8',
              fillOpacity: 0.9,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
          }),
        );
        bounds.extend({ lat: w.fromLat, lng: w.fromLng });
        hasPoint = true;
      }

      if (hasPoint) map.fitBounds(bounds, 48);
    }

    async function tick() {
      const payload = await api<MapData>('/admin/ops/map');
      if (cancelled) return;
      setData(payload);
      if (!googleMapsApiKey()) {
        setError('Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for Google Maps');
        return;
      }
      const g = await loadGoogleMaps();
      if (!g) {
        setError('Failed to load Google Maps');
        return;
      }
      setError(null);
      await paint(g, payload);
    }

    tick().catch(() => setError('Could not load fleet map'));
    timer = setInterval(() => tick().catch(() => undefined), 12000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];
      mapRef.current = null;
    };
  }, []);

  const counts = useMemo(() => {
    const drivers = data?.drivers ?? [];
    return {
      live: drivers.filter((d) => d.live !== false && !d.unregistered).length,
      pending: drivers.filter(
        (d) => d.unregistered || d.driver.approvalStatus === 'PENDING_KYC',
      ).length,
      trips: data?.trips.length ?? 0,
    };
  }, [data]);

  return (
    <div>
      {title ? (
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h2 className="page-title" style={{ fontSize: compact ? 18 : 28 }}>
              {title}
            </h2>
            <p className="muted">
              Live {counts.live} · pending registration {counts.pending} · trips {counts.trips}
            </p>
          </div>
          <div className="row">
            <span className="chip ok">Live</span>
            <span className="chip warn">Unregistered / KYC</span>
            <span className="chip bad">Active trip</span>
            <span className="chip info">Waiting request</span>
          </div>
        </div>
      ) : null}
      <div className={`map ${compact ? 'compact' : ''}`}>
        <div ref={host} className="gmaps-host" />
        {error ? (
          <div className="gmaps-empty">
            <p>{error}</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
