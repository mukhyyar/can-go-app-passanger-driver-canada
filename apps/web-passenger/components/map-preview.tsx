'use client';

import { useMemo } from 'react';
import type { Place } from '../lib/types';

export function MapPreview({ from, to }: { from: Place | null; to: Place | null }) {
  const srcDoc = useMemo(() => mapHtml(from, to), [from, to]);
  return (
    <div className="map-box">
      <iframe title="Route map" srcDoc={srcDoc} />
    </div>
  );
}

function mapHtml(from: Place | null, to: Place | null): string {
  const hasA = !!from;
  const hasB = !!to;
  return `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html,body,#map{margin:0;height:100%;width:100%;background:#dfe7ee}
  .pin{width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center}
  .pin span{transform:rotate(45deg);color:#fff;font:800 11px/1 system-ui}
  .pin-a{background:#B41B1D}.pin-b{background:#1A1A1A}
</style></head>
<body><div id="map"></div>
<script>
  const from = ${hasA ? `[${from!.lat}, ${from!.lng}]` : 'null'};
  const to = ${hasB ? `[${to!.lat}, ${to!.lng}]` : 'null'};
  const map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  function pin(letter, cls) {
    return L.divIcon({ className:'', html:'<div class="pin '+cls+'"><span>'+letter+'</span></div>', iconSize:[26,26], iconAnchor:[13,26] });
  }
  if (!from) { map.setView([20, 0], 2); }
  else {
    const layers = [L.marker(from, { icon: pin('A','pin-a') }).addTo(map)];
    if (to) {
      layers.push(L.marker(to, { icon: pin('B','pin-b') }).addTo(map));
      fetch('https://router.project-osrm.org/route/v1/driving/'+from[1]+','+from[0]+';'+to[1]+','+to[0]+'?overview=full&geometries=geojson')
        .then(r => r.json()).then(data => {
          if (data && data.routes && data.routes[0]) {
            const coords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
            layers.push(L.polyline(coords, { color:'#B41B1D', weight:5, opacity:.9 }).addTo(map));
          }
          map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18));
        }).catch(() => map.fitBounds(L.featureGroup(layers).getBounds().pad(0.18)));
    } else { map.setView(from, 13); }
  }
</script></body></html>`;
}
