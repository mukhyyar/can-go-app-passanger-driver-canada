const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

export type GLatLng = { lat: number; lng: number };

export type GMap = {
  setCenter: (ll: GLatLng) => void;
  setZoom: (z: number) => void;
  fitBounds: (b: GLatLngBounds, padding?: number | object) => void;
  panTo: (ll: GLatLng) => void;
  getDiv: () => HTMLElement;
};

export type GLatLngBounds = {
  extend: (ll: GLatLng) => void;
};

export type GOverlay = {
  setMap: (m: GMap | null) => void;
};

export type GMapsNS = {
  Map: new (el: HTMLElement, opts: object) => GMap;
  Marker: new (opts: object) => GOverlay & {
    setPosition: (ll: GLatLng) => void;
    addListener: (ev: string, fn: () => void) => { remove: () => void };
  };
  Polyline: new (opts: object) => GOverlay;
  Circle: new (opts: object) => GOverlay;
  LatLngBounds: new () => GLatLngBounds;
  SymbolPath: { CIRCLE: number; FORWARD_CLOSED_ARROW: number };
  // OverlayView is subclassed at runtime; keep the constructor loose for prototype assignment.
  OverlayView: new () => object;
};

declare global {
  interface Window {
    google?: { maps: GMapsNS };
    __cangoMapsJsPromise?: Promise<void>;
  }
}

export function googleMapsApiKey(): string {
  return MAPS_KEY;
}

export async function loadGoogleMaps(): Promise<GMapsNS | null> {
  if (typeof window === 'undefined') return null;
  if (!MAPS_KEY) return null;
  if (window.google?.maps) return window.google.maps;
  if (!window.__cangoMapsJsPromise) {
    window.__cangoMapsJsPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector(
        'script[data-cango-maps="1"]',
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener(
          'error',
          () => reject(new Error('Maps JS failed')),
          { once: true },
        );
        return;
      }
      const s = document.createElement('script');
      s.dataset.cangoMaps = '1';
      s.async = true;
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}`;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Maps JS failed to load'));
      document.head.appendChild(s);
    });
  }
  try {
    await window.__cangoMapsJsPromise;
  } catch {
    return null;
  }
  return window.google?.maps ?? null;
}

type MarkerHandle = {
  setPosition: (ll: GLatLng) => void;
  setHeading: (deg: number) => void;
  remove: () => void;
  addListener: (ev: 'mouseover' | 'mouseout', fn: () => void) => void;
};

/** HTML marker via OverlayView (login fleet cars). */
export function createHtmlMarker(
  g: GMapsNS,
  map: GMap,
  position: GLatLng,
  html: string,
  size: number,
): MarkerHandle {
  type OverlayInst = {
    position: GLatLng;
    heading: number;
    el?: HTMLDivElement;
    setMap: (m: GMap | null) => void;
    getPanes: () => { overlayMouseTarget?: HTMLElement } | null;
    getProjection: () => {
      fromLatLngToDivPixel: (ll: GLatLng) => { x: number; y: number } | null;
    } | null;
    onAdd: () => void;
    draw: () => void;
    onRemove: () => void;
  };

  // Classic Maps OverlayView subclass pattern
  function HtmlOverlay(this: OverlayInst) {
    this.position = position;
    this.heading = 0;
  }
  // OverlayView prototypes are assigned at runtime; keep TS loose here.
  const proto = new g.OverlayView() as OverlayInst;
  HtmlOverlay.prototype = proto;

  proto.onAdd = function onAdd(this: OverlayInst) {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.marginLeft = `${-size / 2}px`;
    el.style.marginTop = `${-size / 2}px`;
    el.style.cursor = 'pointer';
    el.innerHTML = html;
    this.el = el;
    this.getPanes()?.overlayMouseTarget?.appendChild(el);
  };

  proto.draw = function draw(this: OverlayInst) {
    const proj = this.getProjection();
    const el = this.el;
    if (!proj || !el) return;
    const pt = proj.fromLatLngToDivPixel(this.position);
    if (!pt) return;
    el.style.left = `${pt.x}px`;
    el.style.top = `${pt.y}px`;
    const inner = el.querySelector('.fleet-car-marker') as HTMLElement | null;
    if (inner) inner.style.transform = `rotate(${this.heading}deg)`;
  };

  proto.onRemove = function onRemove(this: OverlayInst) {
    this.el?.remove();
    this.el = undefined;
  };

  const overlay = new (HtmlOverlay as unknown as new () => OverlayInst)();
  overlay.setMap(map);

  return {
    setPosition(ll) {
      overlay.position = ll;
      overlay.draw();
    },
    setHeading(deg) {
      overlay.heading = deg;
      overlay.draw();
    },
    remove() {
      overlay.setMap(null);
    },
    addListener(ev, fn) {
      const bind = () => {
        const el = overlay.el;
        if (!el) {
          requestAnimationFrame(bind);
          return;
        }
        el.addEventListener(ev === 'mouseover' ? 'mouseenter' : 'mouseleave', fn);
      };
      bind();
    },
  };
}
