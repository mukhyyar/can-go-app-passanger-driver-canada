'use client';

import { useEffect, useRef, useState } from 'react';

type Pt = { lat: number; lng: number; weight?: number };

type LeafletMap = {
  remove: () => void;
  setView: (ll: [number, number], z: number) => LeafletMap;
  invalidateSize: () => void;
};
type LeafletLayer = { addTo: (m: LeafletMap | LeafletLayer) => LeafletLayer; clearLayers?: () => void };
type LeafletNS = {
  map: (el: HTMLElement, opts?: object) => LeafletMap;
  tileLayer: (url: string, opts: { attribution: string }) => { addTo: (m: LeafletMap) => void };
  layerGroup: () => LeafletLayer;
  circleMarker: (
    ll: [number, number],
    opts: { radius: number; color: string; fillColor?: string; fillOpacity?: number; weight?: number },
  ) => { addTo: (m: LeafletLayer) => { bindPopup: (html: string) => void } };
};

function leafletFromWindow(): LeafletNS | undefined {
  return (window as unknown as { L?: LeafletNS }).L;
}

async function ensureLeaflet(): Promise<LeafletNS | null> {
  const already = leafletFromWindow();
  if (already) return already;
  try {
    if (!document.querySelector('link[href="/vendor/leaflet/leaflet.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = '/vendor/leaflet/leaflet.css';
      document.head.appendChild(l);
    }
    await new Promise<void>((resolve, reject) => {
      if (document.querySelector('script[src="/vendor/leaflet/leaflet.js"]')) {
        resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = '/vendor/leaflet/leaflet.js';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('leaflet'));
      document.body.appendChild(s);
    });
    return leafletFromWindow() ?? null;
  } catch {
    return null;
  }
}

const LAYER_COLOR: Record<string, string> = {
  requests: '#b41b1d',
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
  const [ready, setReady] = useState(false);
  const pts = layers[active] ?? [];

  useEffect(() => {
    let map: LeafletMap | null = null;
    let cancelled = false;
    (async () => {
      const L = await ensureLeaflet();
      if (!L || !host.current || cancelled) return;
      map = L.map(host.current, { zoomControl: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OSM',
      }).addTo(map);
      const group = L.layerGroup().addTo(map);
      const color = LAYER_COLOR[active] ?? '#b41b1d';
      const shown = pts.slice(0, 600);
      for (const p of shown) {
        L.circleMarker([p.lat, p.lng], {
          radius: 5 + (p.weight ?? 1),
          color,
          fillColor: color,
          fillOpacity: 0.35,
          weight: 1,
        }).addTo(group);
      }
      if (shown[0]) map.setView([shown[0].lat, shown[0].lng], 11);
      else map.setView([24.8607, 67.0011], 11);
      setTimeout(() => map?.invalidateSize(), 80);
      setReady(true);
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [active, pts]);

  return (
    <div className="map" style={{ height: 420 }}>
      <div ref={host} className="leaflet-host" />
      {!ready && <p className="radar-empty">Loading map…</p>}
    </div>
  );
}
