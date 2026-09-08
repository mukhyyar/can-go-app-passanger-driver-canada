'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';

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
  trips: Array<{ id: string; fromLat: number; fromLng: number; toLat?: number; toLng?: number; status: string }>;
  waiting: Array<{ id: string; fromLat: number; fromLng: number; fromLabel?: string }>;
};

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
  polyline: (ll: [number, number][], opts: { color: string; weight?: number }) => { addTo: (m: LeafletLayer) => void };
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

function pinColor(d: MapData['drivers'][number]) {
  if (d.unregistered || d.driver.approvalStatus === 'PENDING_KYC' || !d.driver.isActivated) return '#f59e0b';
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
  forceRadar = false,
}: {
  title?: string;
  compact?: boolean;
  forceRadar?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<MapData | null>(null);
  const [mode, setMode] = useState<'leaflet' | 'radar'>('radar');
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    let map: LeafletMap | null = null;
    let layers: LeafletLayer | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    async function paint(Leaflet: LeafletNS, payload: MapData) {
      if (cancelled || !host.current) return;
      if (!map) {
        const m = Leaflet.map(host.current, { zoomControl: true, attributionControl: false }).setView(
          [24.86, 67.01],
          11,
        );
        Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OSM',
        }).addTo(m);
        layers = Leaflet.layerGroup().addTo(m);
        map = m;
        setTimeout(() => m.invalidateSize(), 120);
      }
      layers?.clearLayers?.();
      const group = layers;
      if (!group) return;
      for (const d of payload.drivers) {
        const color = pinColor(d);
        Leaflet.circleMarker([d.lat, d.lng], {
          radius: d.unregistered ? 8 : 7,
          color,
          fillColor: color,
          fillOpacity: 0.92,
          weight: 2,
        })
          .addTo(group)
          .bindPopup(
            `<strong>${d.driver.fullName}</strong><br/>${d.driver.plate ?? ''}<br/>${pinLabel(d)}`,
          );
      }
      for (const t of payload.trips) {
        Leaflet.circleMarker([t.fromLat, t.fromLng], {
          radius: 6,
          color: '#b41b1d',
          fillColor: '#b41b1d',
          fillOpacity: 0.9,
        })
          .addTo(group)
          .bindPopup(`Trip ${t.status}`);
        if (t.toLat && t.toLng) {
          Leaflet.polyline(
            [
              [t.fromLat, t.fromLng],
              [t.toLat, t.toLng],
            ],
            { color: '#b41b1d', weight: 3 },
          ).addTo(group);
        }
      }
      for (const w of payload.waiting) {
        Leaflet.circleMarker([w.fromLat, w.fromLng], {
          radius: 6,
          color: '#1d4ed8',
          fillColor: '#1d4ed8',
          fillOpacity: 0.9,
        })
          .addTo(group)
          .bindPopup(`Waiting ${w.fromLabel ?? w.id}`);
      }
      setMode('leaflet');
    }

    async function tick() {
      const payload = await api<MapData>('/admin/ops/map');
      if (cancelled) return;
      setData(payload);
      if (!forceRadar) {
        const Leaflet = await ensureLeaflet();
        if (Leaflet) await paint(Leaflet, payload);
      }
    }

    tick().catch(() => setMode('radar'));
    timer = setInterval(() => tick().catch(() => undefined), 12000);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      map?.remove();
    };
  }, [forceRadar]);

  const counts = useMemo(() => {
    const drivers = data?.drivers ?? [];
    return {
      live: drivers.filter((d) => d.live !== false && !d.unregistered).length,
      pending: drivers.filter((d) => d.unregistered || d.driver.approvalStatus === 'PENDING_KYC').length,
      trips: data?.trips.length ?? 0,
    };
  }, [data]);

  return (
    <div>
      {title ? (
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <h2 className="page-title" style={{ fontSize: compact ? 18 : 28 }}>{title}</h2>
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
        {!forceRadar && <div ref={host} className="leaflet-host" />}
        {mode !== 'leaflet' && <RadarPlot data={data} hover={hover} setHover={setHover} />}
      </div>
    </div>
  );
}

function RadarPlot({
  data,
  hover,
  setHover,
}: {
  data: MapData | null;
  hover: string | null;
  setHover: (v: string | null) => void;
}) {
  const pts = useMemo(() => {
    const list: Array<{ key: string; lat: number; lng: number; color: string; label: string }> = [];
    const ok = (lat: unknown, lng: unknown) =>
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      !(Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01);
    for (const d of data?.drivers ?? []) {
      if (!ok(d.lat, d.lng)) continue;
      list.push({
        key: d.driver.id,
        lat: d.lat,
        lng: d.lng,
        color: pinColor(d),
        label: `${d.driver.fullName} · ${pinLabel(d)}`,
      });
    }
    for (const t of data?.trips ?? []) {
      if (!ok(t.fromLat, t.fromLng)) continue;
      list.push({
        key: `t-${t.id}`,
        lat: t.fromLat,
        lng: t.fromLng,
        color: '#b41b1d',
        label: `Trip ${t.status}`,
      });
    }
    for (const w of data?.waiting ?? []) {
      if (!ok(w.fromLat, w.fromLng)) continue;
      list.push({
        key: `w-${w.id}`,
        lat: w.fromLat,
        lng: w.fromLng,
        color: '#1d4ed8',
        label: `Waiting ${w.fromLabel ?? w.id}`,
      });
    }
    return list;
  }, [data]);

  const bounds = useMemo(() => {
    const pad = (min: number, max: number) => {
      if (max - min < 0.05) return { min: min - 0.06, max: max + 0.06 };
      const extra = (max - min) * 0.12;
      return { min: min - extra, max: max + extra };
    };
    if (!pts.length) {
      return { minLat: 24.75, maxLat: 24.97, minLng: 66.9, maxLng: 67.16 };
    }
    const lats = [...pts.map((p) => p.lat)].sort((a, b) => a - b);
    const lngs = [...pts.map((p) => p.lng)].sort((a, b) => a - b);
    const mid = (arr: number[]) => arr[Math.floor(arr.length / 2)];
    const mLat = mid(lats);
    const mLng = mid(lngs);
    const clustered = pts.filter(
      (p) => Math.abs(p.lat - mLat) < 1.8 && Math.abs(p.lng - mLng) < 1.8,
    );
    const use = clustered.length ? clustered : pts;
    const plat = pad(Math.min(...use.map((p) => p.lat)), Math.max(...use.map((p) => p.lat)));
    const plng = pad(Math.min(...use.map((p) => p.lng)), Math.max(...use.map((p) => p.lng)));
    return { minLat: plat.min, maxLat: plat.max, minLng: plng.min, maxLng: plng.max };
  }, [pts]);

  function xy(lat: number, lng: number) {
    const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100;
    const y = (1 - (lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * 100;
    return {
      left: `${Math.min(94, Math.max(6, x))}%`,
      top: `${Math.min(94, Math.max(6, y))}%`,
    };
  }

  return (
    <div className="radar">
      <div className="radar-scan" />
      {!pts.length && <p className="radar-empty">Waiting for fleet pings</p>}
      {pts.map((p) => (
        <button
          type="button"
          key={p.key}
          className={`radar-pin ${hover === p.key ? 'on' : ''}`}
          style={{ ...xy(p.lat, p.lng), background: p.color, boxShadow: `0 0 0 8px ${p.color}33` }}
          onMouseEnter={() => setHover(p.key)}
          onMouseLeave={() => setHover(null)}
          title={p.label}
        />
      ))}
      {hover && <div className="radar-tip">{pts.find((p) => p.key === hover)?.label}</div>}
    </div>
  );
}
