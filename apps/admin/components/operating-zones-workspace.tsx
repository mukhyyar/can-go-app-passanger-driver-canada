'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { api } from '../lib/api';
import {
  googleMapsApiKey,
  loadGoogleMaps,
  type GCircle,
  type GMap,
  type GMapsNS,
  type GPolygon,
} from '../lib/google-maps-loader';
import {
  circlePayload,
  parseZoneGeom,
  polygonPayload,
  type OperatingZoneRow,
} from '../lib/operating-zone-geo';
import { useToast } from './toast';

const COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#db2777',
];

type Props = {
  zones: OperatingZoneRow[];
  canEdit: boolean;
  /** When set, only that driver’s zones are shown and create targets them. */
  driverId?: string;
  compact?: boolean;
  onChanged: () => void | Promise<void>;
};

export function OperatingZonesWorkspace({
  zones,
  canEdit,
  driverId,
  compact = false,
  onChanged,
}: Props) {
  const toast = useToast();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<GMap | null>(null);
  const gRef = useRef<GMapsNS | null>(null);
  const overlaysRef = useRef<
    Array<{
      id: string;
      overlay: GCircle | GPolygon;
      kind: 'circle' | 'polygon';
    }>
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    let list = zones;
    if (driverId) list = list.filter((z) => z.driverId === driverId);
    const needle = q.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((z) => {
      const driver = z.driver?.fullName ?? '';
      return (
        z.name.toLowerCase().includes(needle) ||
        driver.toLowerCase().includes(needle) ||
        z.zoneType.toLowerCase().includes(needle)
      );
    });
  }, [zones, driverId, q]);

  const selected = useMemo(
    () => filtered.find((z) => z.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  useEffect(() => {
    if (selected && selected.id !== selectedId) {
      setSelectedId(selected.id);
      setNameDraft(selected.name);
    } else if (!selected) {
      setSelectedId(null);
      setNameDraft('');
    } else {
      setNameDraft(selected.name);
    }
    setEditing(false);
    setCreating(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const clearOverlays = useCallback(() => {
    for (const o of overlaysRef.current) {
      try {
        gRef.current?.event.clearInstanceListeners(o.overlay);
      } catch {
        /* ignore */
      }
      o.overlay.setMap(null);
    }
    overlaysRef.current = [];
  }, []);

  const paint = useCallback(
    (
      g: GMapsNS,
      list: OperatingZoneRow[],
      highlightId: string | null,
      editableId: string | null,
    ) => {
      if (!host.current) return;
      if (!mapRef.current) {
        mapRef.current = new g.Map(host.current, {
          center: { lat: 43.83, lng: -79.54 },
          zoom: 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: !compact,
        });
      }
      const map = mapRef.current;
      clearOverlays();
      const bounds = new g.LatLngBounds();
      let hasPoint = false;

      list.forEach((zone, idx) => {
        const parsed = parseZoneGeom(zone);
        if (!parsed) return;
        const color = COLORS[idx % COLORS.length];
        const active = zone.id === highlightId;
        const strokeWeight = active ? 3 : 1.5;
        const fillOpacity = active ? 0.28 : 0.14;
        const makeEditable = Boolean(editableId && zone.id === editableId);

        if (parsed.kind === 'circle') {
          const circle = new g.Circle({
            map,
            center: parsed.center,
            radius: parsed.radiusKm * 1000,
            strokeColor: color,
            strokeOpacity: 0.95,
            strokeWeight,
            fillColor: color,
            fillOpacity,
            editable: makeEditable,
            clickable: true,
          });
          circle.addListener('click', () => {
            setSelectedId(zone.id);
            setNameDraft(zone.name);
            setEditing(false);
            setCreating(false);
          });
          overlaysRef.current.push({ id: zone.id, overlay: circle, kind: 'circle' });
          bounds.extend(parsed.center);
          const d = parsed.radiusKm / 111;
          bounds.extend({
            lat: parsed.center.lat + d,
            lng: parsed.center.lng,
          });
          bounds.extend({
            lat: parsed.center.lat - d,
            lng: parsed.center.lng,
          });
          hasPoint = true;
        } else {
          const polygon = new g.Polygon({
            map,
            paths: parsed.paths,
            strokeColor: color,
            strokeOpacity: 0.95,
            strokeWeight,
            fillColor: color,
            fillOpacity,
            editable: makeEditable,
            clickable: true,
          });
          polygon.addListener('click', () => {
            setSelectedId(zone.id);
            setNameDraft(zone.name);
            setEditing(false);
            setCreating(false);
          });
          overlaysRef.current.push({
            id: zone.id,
            overlay: polygon,
            kind: 'polygon',
          });
          for (const p of parsed.paths) {
            bounds.extend(p);
            hasPoint = true;
          }
        }
      });

      if (hasPoint && !editableId) map.fitBounds(bounds, compact ? 32 : 48);
    },
    [clearOverlays, compact],
  );

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!googleMapsApiKey()) {
        setError('Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY for Google Maps');
        return;
      }
      const g = await loadGoogleMaps();
      if (cancelled) return;
      if (!g) {
        setError('Failed to load Google Maps');
        return;
      }
      gRef.current = g;
      setError(null);
      if (creating) return;
      paint(
        g,
        filtered,
        selected?.id ?? null,
        editing && selected ? selected.id : null,
      );
    }
    boot().catch(() => setError('Could not load operating zones map'));
    return () => {
      cancelled = true;
    };
  }, [filtered, selected?.id, paint, editing, creating]);

  useEffect(() => {
    return () => {
      clearOverlays();
      mapRef.current = null;
    };
  }, [clearOverlays]);

  function startEdit() {
    if (!canEdit || !selected) return;
    setCreating(false);
    setEditing(true);
    setNameDraft(selected.name);
  }

  function cancelEdit() {
    setEditing(false);
    setCreating(false);
    const g = gRef.current;
    if (g) paint(g, filtered, selected?.id ?? null, null);
  }

  function readEditedPayload(name: string) {
    if (!selected) return null;
    const entry = overlaysRef.current.find((o) => o.id === selected.id);
    if (!entry) return null;
    if (entry.kind === 'circle') {
      const c = entry.overlay as GCircle;
      const center = c.getCenter();
      if (!center) return null;
      const radiusM = c.getRadius();
      if (!radiusM || radiusM <= 0) return null;
      return circlePayload(
        name,
        { lat: center.lat(), lng: center.lng() },
        radiusM / 1000,
      );
    }
    const poly = entry.overlay as GPolygon;
    const path = poly.getPath();
    const paths: Array<{ lat: number; lng: number }> = [];
    for (let i = 0; i < path.getLength(); i++) {
      const ll = path.getAt(i);
      paths.push({ lat: ll.lat(), lng: ll.lng() });
    }
    if (paths.length < 3) return null;
    return polygonPayload(name, paths);
  }

  async function saveEdit() {
    if (!selected || !canEdit) return;
    const name = nameDraft.trim() || selected.name;
    const payload = readEditedPayload(name);
    if (!payload) {
      toast.push('Invalid zone geometry', 'bad');
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/zones/${selected.id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      toast.push('Zone updated');
      setEditing(false);
      await onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Update failed', 'bad');
    } finally {
      setBusy(false);
    }
  }

  async function removeZone() {
    if (!selected || !canEdit) return;
    if (!window.confirm(`Delete zone “${selected.name}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await api(`/admin/zones/${selected.id}`, { method: 'DELETE' });
      toast.push('Zone deleted');
      setEditing(false);
      setSelectedId(null);
      await onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Delete failed', 'bad');
    } finally {
      setBusy(false);
    }
  }

  function startCreateCircle() {
    if (!canEdit || !driverId || !gRef.current || !mapRef.current) return;
    const map = mapRef.current;
    const g = gRef.current;
    let center = { lat: 43.83, lng: -79.54 };
    try {
      const c = map.getCenter();
      center = { lat: c.lat(), lng: c.lng() };
    } catch {
      /* keep default */
    }
    setCreating(true);
    setEditing(false);
    setSelectedId(null);
    setNameDraft('New operating zone');
    clearOverlays();
    const circle = new g.Circle({
      map,
      center,
      radius: 5000,
      strokeColor: '#2563eb',
      strokeOpacity: 0.95,
      strokeWeight: 3,
      fillColor: '#2563eb',
      fillOpacity: 0.28,
      editable: true,
    });
    overlaysRef.current = [
      { id: '__new__', overlay: circle, kind: 'circle' },
    ];
    map.setCenter(center);
    map.setZoom(11);
  }

  async function saveCreate() {
    if (!canEdit || !driverId) return;
    const name = nameDraft.trim() || 'Operating Zone';
    const entry = overlaysRef.current.find((o) => o.id === '__new__');
    if (!entry || entry.kind !== 'circle') {
      toast.push('Draw a circle first', 'bad');
      return;
    }
    const c = entry.overlay as GCircle;
    const center = c.getCenter();
    if (!center) return;
    const radiusM = c.getRadius();
    if (!radiusM || radiusM <= 0) {
      toast.push('Invalid radius', 'bad');
      return;
    }
    const payload = {
      driverId,
      ...circlePayload(
        name,
        { lat: center.lat(), lng: center.lng() },
        radiusM / 1000,
      ),
    };
    setBusy(true);
    try {
      await api('/admin/zones', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      toast.push('Zone created');
      setCreating(false);
      await onChanged();
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Create failed', 'bad');
    } finally {
      setBusy(false);
    }
  }

  const parsedSelected = selected ? parseZoneGeom(selected) : null;

  return (
    <div className={`oz-workspace ${compact ? 'compact' : ''}`}>
      <div className="oz-sidebar panel">
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <input
            className="input"
            placeholder="Search driver or zone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1 }}
          />
        </div>
        <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
          {filtered.length} zone{filtered.length === 1 ? '' : 's'}
        </p>
        <ul className="oz-list">
          {filtered.length === 0 ? (
            <li className="muted" style={{ padding: 12 }}>
              No operating zones found.
            </li>
          ) : (
            filtered.map((z, idx) => (
              <li key={z.id}>
                <button
                  type="button"
                  className={`oz-list-item ${selected?.id === z.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedId(z.id);
                    setNameDraft(z.name);
                    setEditing(false);
                    setCreating(false);
                  }}
                >
                  <span
                    className="oz-swatch"
                    style={{ background: COLORS[idx % COLORS.length] }}
                  />
                  <span className="oz-list-body">
                    <strong>{z.driver?.fullName || 'Driver'}</strong>
                    <span className="muted">
                      {z.name} · {z.zoneType}
                      {z.radiusKm != null ? ` · ${z.radiusKm.toFixed(1)} km` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="oz-main">
        <div className={`map ${compact ? 'compact' : ''}`}>
          <div ref={host} className="gmaps-host" />
          {error ? (
            <div className="gmaps-empty">
              <p>{error}</p>
            </div>
          ) : null}
        </div>

        <div className="panel oz-detail" style={{ marginTop: 12 }}>
          {creating ? (
            <>
              <h3 style={{ marginTop: 0 }}>New circle zone</h3>
              <label className="field">
                <span>Name</span>
                <input
                  className="input"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  disabled={busy}
                />
              </label>
              <p className="muted" style={{ fontSize: 13 }}>
                Drag the circle and resize handles, then save.
              </p>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={busy}
                  onClick={() => void saveCreate()}
                >
                  Save zone
                </button>
                <button
                  type="button"
                  className="btn ghost sm"
                  disabled={busy}
                  onClick={cancelEdit}
                >
                  Cancel
                </button>
              </div>
            </>
          ) : selected ? (
            <>
              <div className="row" style={{ justifyContent: 'space-between', gap: 8 }}>
                <div>
                  <h3 style={{ margin: 0 }}>{selected.name}</h3>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {selected.driver?.fullName || '—'}
                    {selected.driver?.baseLocation
                      ? ` · ${selected.driver.baseLocation}`
                      : ''}
                    {' · '}
                    {selected.zoneType}
                    {parsedSelected?.kind === 'circle'
                      ? ` · ${parsedSelected.radiusKm.toFixed(1)} km`
                      : ''}
                  </p>
                </div>
                {selected.driver?.userId ? (
                  <Link
                    className="btn ghost sm"
                    href={`/users/${selected.driver.userId}`}
                  >
                    Open driver
                  </Link>
                ) : null}
              </div>

              {editing ? (
                <label className="field" style={{ marginTop: 12 }}>
                  <span>Name</span>
                  <input
                    className="input"
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    disabled={busy}
                  />
                </label>
              ) : null}

              {canEdit ? (
                <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                  {editing ? (
                    <>
                      <button
                        type="button"
                        className="btn primary sm"
                        disabled={busy}
                        onClick={() => void saveEdit()}
                      >
                        Save changes
                      </button>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={busy}
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="btn sm"
                        disabled={busy}
                        onClick={startEdit}
                      >
                        Edit on map
                      </button>
                      <button
                        type="button"
                        className="btn danger sm"
                        disabled={busy}
                        onClick={() => void removeZone()}
                      >
                        Delete
                      </button>
                      {driverId ? (
                        <button
                          type="button"
                          className="btn ghost sm"
                          disabled={busy}
                          onClick={startCreateCircle}
                        >
                          Add circle zone
                        </button>
                      ) : null}
                    </>
                  )}
                </div>
              ) : (
                <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                  Read-only — need kyc.edit to change zones.
                </p>
              )}
              {editing ? (
                <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  Drag handles to reshape the {selected.zoneType}, then save.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>No zone selected</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                {driverId
                  ? 'This driver has not set an operating zone yet.'
                  : 'Select a zone from the list, or wait for drivers to save coverage areas.'}
              </p>
              {canEdit && driverId ? (
                <button
                  type="button"
                  className="btn primary sm"
                  disabled={busy}
                  onClick={startCreateCircle}
                >
                  Add circle zone
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
