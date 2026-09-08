/** Top-down car silhouette for fleet markers. Points “north” (up); rotate via CSS. */

import { FleetStatus, STATUS_COLORS } from '../../data/demoFleetRoutes';

export function carMarkerHtml(status: FleetStatus, size = 32): string {
  const color = STATUS_COLORS[status];
  return `<div class="fleet-car-marker" style="--fleet-color:${color};width:${size}px;height:${size}px" data-status="${status}">
    <svg viewBox="0 0 48 72" width="${size}" height="${size}" aria-hidden="true">
      <ellipse cx="24" cy="64" rx="13" ry="4" fill="rgba(0,0,0,0.2)"/>
      <path d="M16 14c0-5 3.5-9 8-9s8 4 8 9v40c0 4.5-3.5 8-8 8s-8-3.5-8-8V14z" fill="${color}" stroke="#fff" stroke-width="2.5"/>
      <path d="M19 18h10c1.2 0 2.2 1.4 2.2 3.2v6.2c0 1.2-.8 2.2-1.8 2.2H18.6c-1 0-1.8-1-1.8-2.2v-6.2c0-1.8 1-3.2 2.2-3.2z" fill="rgba(255,255,255,0.42)"/>
      <path d="M19 40h10c1 0 1.8.9 1.8 2v5c0 1.1-.8 2-1.8 2H19c-1 0-1.8-.9-1.8-2v-5c0-1.1.8-2 1.8-2z" fill="rgba(255,255,255,0.28)"/>
      <rect x="12.5" y="22" width="4" height="9" rx="1.5" fill="rgba(0,0,0,0.28)"/>
      <rect x="31.5" y="22" width="4" height="9" rx="1.5" fill="rgba(0,0,0,0.28)"/>
      <rect x="12.5" y="42" width="4" height="9" rx="1.5" fill="rgba(0,0,0,0.28)"/>
      <rect x="31.5" y="42" width="4" height="9" rx="1.5" fill="rgba(0,0,0,0.28)"/>
      <circle cx="24" cy="10" r="1.6" fill="rgba(255,255,255,0.55)"/>
    </svg>
  </div>`;
}
