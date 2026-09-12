'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../lib/types';
import { API_BASE } from '../lib/api';

const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type RouteBody = {
  geometry?: { coordinates?: [number, number][] };
};

type GMaps = {
  Map: new (el: HTMLElement, opts: object) => GMap;
  Marker: new (opts: object) => GOverlay;
  Polyline: new (opts: object) => GOverlay;
  LatLngBounds: new () => {
    extend: (ll: { lat: number; lng: number }) => void;
  };
};

type GMap = {
  setCenter: (ll: { lat: number; lng: number }) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: object, padding?: number) => void;
};

type GOverlay = {
  setMap: (m: GMap | null) => void;
};

declare global {
  interface Window {
    google?: { maps: GMaps };
    __cangoMapsJsPromise?: Promise<void>;
  }
}

function loadMapsJs(apiKey: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.maps) return Promise.resolve();
  if (window.__cangoMapsJsPromise) return window.__cangoMapsJsPromise;
  window.__cangoMapsJsPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(
      'script[data-cango-maps="1"]',
    ) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Maps JS failed')), {
        once: true,
      });
      return;
    }
    const s = document.createElement('script');
    s.dataset.cangoMaps = '1';
    s.async = true;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Maps JS failed to load'));
    document.head.appendChild(s);
  });
  return window.__cangoMapsJsPromise;
}

export function MapPreview({ from, to }: { from: Place | null; to: Place | null }) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const overlays = useRef<GOverlay[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fromKey = from ? `${from.lat},${from.lng}` : '';
  const toKey = to ? `${to.lat},${to.lng}` : '';

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!host.current) return;
      if (!MAPS_KEY) {
        setError('Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
        return;
      }
      try {
        await loadMapsJs(MAPS_KEY);
      } catch {
        if (!cancelled) setError('Google Maps failed to load');
        return;
      }
      if (cancelled || !host.current || !window.google?.maps) return;
      setError(null);

      const g = window.google.maps;
      if (!mapRef.current) {
        mapRef.current = new g.Map(host.current, {
          center: from ? { lat: from.lat, lng: from.lng } : { lat: 20, lng: 0 },
          zoom: from ? 13 : 2,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
      }
      const map = mapRef.current;

      for (const o of overlays.current) o.setMap(null);
      overlays.current = [];

      if (!from) {
        map.setCenter({ lat: 20, lng: 0 });
        map.setZoom(2);
        return;
      }

      overlays.current.push(
        new g.Marker({
          map,
          position: { lat: from.lat, lng: from.lng },
          label: { text: 'A', color: '#fff', fontWeight: '700' },
          title: from.label,
        }),
      );

      if (!to) {
        map.setCenter({ lat: from.lat, lng: from.lng });
        map.setZoom(13);
        return;
      }

      overlays.current.push(
        new g.Marker({
          map,
          position: { lat: to.lat, lng: to.lng },
          label: { text: 'B', color: '#fff', fontWeight: '700' },
          title: to.label,
        }),
      );

      const bounds = new g.LatLngBounds();
      bounds.extend({ lat: from.lat, lng: from.lng });
      bounds.extend({ lat: to.lat, lng: to.lng });

      try {
        const res = await fetch(`${API_BASE}/maps/route`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fromLat: from.lat,
            fromLng: from.lng,
            toLat: to.lat,
            toLng: to.lng,
          }),
        });
        if (res.ok) {
          const body = (await res.json()) as RouteBody;
          const coords = body.geometry?.coordinates;
          if (coords?.length) {
            const path = coords.map(([lng, lat]) => ({ lat, lng }));
            overlays.current.push(
              new g.Polyline({
                map,
                path,
                strokeColor: '#e50000',
                strokeOpacity: 0.9,
                strokeWeight: 5,
              }),
            );
            for (const p of path) bounds.extend(p);
          }
        }
      } catch {
        /* markers still shown */
      }

      map.fitBounds(bounds, 48);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [fromKey, toKey, from, to]);

  const missingKey = useMemo(() => !MAPS_KEY, []);

  return (
    <div className="map-box" style={{ position: 'relative' }}>
      <div ref={host} style={{ width: '100%', height: '100%', minHeight: 220 }} />
      {(error || missingKey) && (
        <p
          className="muted"
          style={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            background: 'rgba(223,231,238,.92)',
            margin: 0,
            padding: 12,
            textAlign: 'center',
          }}
        >
          {error || 'Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY'}
        </p>
      )}
    </div>
  );
}
