'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import type { Ride } from '../../../lib/types';
import { useAuth } from '../../../components/auth-provider';
import { AuthModal } from '../../../components/auth-modal';
import { MapPreview } from '../../../components/map-preview';
import { SiteFooter } from '../../../components/site-footer';
import { SiteHeader } from '../../../components/site-header';

export default function RideDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, ready } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load(access = token) {
    if (!access) return;
    const data = await api<Ride>(`/rides/${params.id}`, { token: access });
    setRide(data);
  }

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAuthOpen(true);
      return;
    }
    load().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    const t = setInterval(() => {
      load().catch(() => undefined);
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, params.id]);

  async function selectOffer(offerId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/rides/${params.id}/select-offer`, {
        method: 'POST',
        token,
        body: JSON.stringify({ offerId }),
      });
      await api('/payments/intents', {
        method: 'POST',
        token,
        body: JSON.stringify({ rideId: params.id }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!token) return;
    setBusy(true);
    try {
      await api(`/rides/${params.id}/cancel`, { method: 'POST', token, body: '{}' });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const from = ride
    ? { id: 'a', label: ride.fromLabel ?? 'A', lat: ride.fromLat ?? 0, lng: ride.fromLng ?? 0 }
    : null;
  const to =
    ride?.toLat != null && ride.toLng != null
      ? { id: 'b', label: ride.toLabel ?? 'B', lat: ride.toLat, lng: ride.toLng }
      : null;
  const offers = ride?.offers ?? [];
  const waiting = ride?.status === 'WAITING_FOR_OFFERS';

  return (
    <div className="page-wrap">
      <SiteHeader onLogin={() => setAuthOpen(true)} />
      <div className="layout">
        <div className="form-col">
          <button className="linkish" type="button" onClick={() => router.push('/')}>
            ← New transfer
          </button>
          <h1 style={{ marginTop: 8 }}>
            {waiting ? 'Waiting for offers' : ride?.status.replaceAll('_', ' ')}
          </h1>
          {ride && (
            <p className="muted">
              {ride.fromLabel} {ride.toLabel ? `→ ${ride.toLabel}` : ''}
            </p>
          )}
          {error && <div className="error-banner">{error}</div>}
          {waiting && (
            <p className="muted">Drivers are bidding on your request. This page refreshes automatically.</p>
          )}
          <div className="card-list" style={{ marginTop: 16 }}>
            {offers.map((o) => {
              const total = o.priceSnapshot?.passengerTotal ?? o.bidAmount;
              return (
                <div key={o.id} className="offer-card">
                  <div>
                    <b>{o.driver?.fullName || 'CAN-GO driver'}</b>
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      {o.vehicleClass ?? 'Vehicle'} · {o.status}
                    </p>
                  </div>
                  <div>
                    <b>{total != null ? `${total}` : '—'}</b>
                    {ride?.status === 'OFFER_SELECTION' && (
                      <button
                        className="cta"
                        style={{ marginTop: 8, height: 40, minWidth: 120 }}
                        disabled={busy}
                        onClick={() => selectOffer(o.id)}
                      >
                        Select
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {ride && ['WAITING_FOR_OFFERS', 'OFFER_SELECTION', 'PAYMENT_PENDING'].includes(ride.status) && (
            <button className="linkish" type="button" disabled={busy} onClick={cancel}>
              Cancel request
            </button>
          )}
        </div>
        <aside className="side-col">
          {from && from.lat ? <MapPreview from={from} to={to} /> : null}
        </aside>
      </div>
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <SiteFooter />
    </div>
  );
}
