'use client';

import { useEffect, useRef, useState } from 'react';
import { googleMapsApiKey, loadGoogleMaps, type GMap, type GOverlay } from '../lib/google-maps-loader';

type Pt = { lat: number; lng: number; weight?: number };

const LAYER_COLOR: Record<string, string> = {
  requests: '#e50000',
  pickups: '#2ea44f',
  dropoffs: '#1d4ed8',
  drivers: '#f59e0b',
  cancellations: '#7c3aed',
};

export function AnalyticsMap({
  layers,
  active,
}: {
  layers: Record<string, Pt[]>;
  active: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const overlaysRef = useRef<GOverlay[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pts = layers[active] ?? [];

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!host.current) return;
      if (!googleMapsApiKey()) {
        setError('Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY');
        return;
      }
      const g = await loadGoogleMaps();
      if (!g || cancelled || !host.current) {
        if (!cancelled) setError('Google Maps failed to load');
        return;
      }

      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];

      if (!mapRef.current) {
        mapRef.current = new g.Map(host.current, {
          center: { lat: 24.8607, lng: 67.0011 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
        });
      }
      const map = mapRef.current;
      const color = LAYER_COLOR[active] ?? '#e50000';
      const shown = pts.slice(0, 600);
      const bounds = new g.LatLngBounds();
      for (const p of shown) {
        overlaysRef.current.push(
          new g.Circle({
            map,
            center: { lat: p.lat, lng: p.lng },
            radius: 40 + (p.weight ?? 1) * 15,
            strokeColor: color,
            strokeWeight: 1,
            fillColor: color,
            fillOpacity: 0.35,
          }),
        );
        bounds.extend({ lat: p.lat, lng: p.lng });
      }
      if (shown[0]) map.fitBounds(bounds, 40);
      else {
        map.setCenter({ lat: 24.8607, lng: 67.0011 });
        map.setZoom(11);
      }
      setReady(true);
      setError(null);
    })();

    return () => {
      cancelled = true;
      for (const o of overlaysRef.current) o.setMap(null);
      overlaysRef.current = [];
    };
  }, [active, pts]);

  return (
    <div className="map" style={{ height: 420, position: 'relative' }}>
      <div ref={host} className="gmaps-host" style={{ height: '100%' }} />
      {!ready && !error && <p className="radar-empty">Loading map…</p>}
      {error && <p className="radar-empty">{error}</p>}
    </div>
  );
}
