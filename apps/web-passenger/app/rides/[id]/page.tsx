'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import {
  formatMoney,
  friendlyRideStatus,
  type PaymentQuote,
  type Ride,
  type RideOffer,
} from '../../../lib/types';
import { useAuth } from '../../../components/auth-provider';
import { AuthModal } from '../../../components/auth-modal';
import { MapPreview } from '../../../components/map-preview';
import { SiteFooter } from '../../../components/site-footer';
import { SiteHeader } from '../../../components/site-header';

type QuoteResponse = {
  paymentQuote: PaymentQuote;
  partialEnabled?: boolean;
  cancellationPolicy?: { title?: string; body?: string };
  paymentMethods?: string[];
};

export default function RideDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { token, ready } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [ride, setRide] = useState<Ride | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payingOfferId, setPayingOfferId] = useState<string | null>(null);
  const [paymentMode, setPaymentMode] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [editing, setEditing] = useState(false);
  const [editPickup, setEditPickup] = useState('');
  const [editComment, setEditComment] = useState('');
  const [editFlight, setEditFlight] = useState('');

  async function load(access = token) {
    if (!access) return;
    const data = await api<Ride>(`/rides/${params.id}`, { token: access });
    setRide(data);
    await api(`/rides/${params.id}/view`, {
      method: 'POST',
      token: access,
      body: '{}',
    }).catch(() => undefined);
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

  async function openPay(offerId: string) {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/rides/${params.id}/validate-book`, {
        method: 'POST',
        token,
        body: JSON.stringify({ offerId }),
      });
      const q = await api<QuoteResponse>('/payments/quote', {
        method: 'POST',
        token,
        body: JSON.stringify({
          rideId: params.id,
          offerId,
          paymentMode: 'FULL',
          platform: 'web',
        }),
      });
      setQuote(q);
      setPaymentMode('FULL');
      setPayingOfferId(offerId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function refreshQuote(mode: 'FULL' | 'PARTIAL') {
    if (!token || !payingOfferId) return;
    setPaymentMode(mode);
    const q = await api<QuoteResponse>('/payments/quote', {
      method: 'POST',
      token,
      body: JSON.stringify({
        rideId: params.id,
        offerId: payingOfferId,
        paymentMode: mode,
        platform: 'web',
      }),
    });
    setQuote(q);
  }

  async function confirmPay() {
    if (!token || !payingOfferId || !quote) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/rides/${params.id}/select-offer`, {
        method: 'POST',
        token,
        body: JSON.stringify({ offerId: payingOfferId }),
      });
      await api('/payments/intents', {
        method: 'POST',
        token,
        body: JSON.stringify({
          rideId: params.id,
          paymentMode,
          paymentMethod: 'CARD',
          termsAccepted: true,
          platform: 'web',
        }),
      });
      setPayingOfferId(null);
      setQuote(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!token || !ride) return;
    setBusy(true);
    try {
      const bookedCancel = ['BOOKED', 'DRIVER_EN_ROUTE', 'DRIVER_ARRIVED'];
      if (bookedCancel.includes(ride.status)) {
        await api(`/rides/${params.id}/transitions`, {
          method: 'POST',
          token,
          body: JSON.stringify({ status: 'PASSENGER_CANCELLED' }),
        });
      } else {
        await api(`/rides/${params.id}/cancel`, {
          method: 'POST',
          token,
          body: '{}',
        });
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    if (!ride) return;
    setEditPickup(
      ride.pickupAt
        ? new Date(ride.pickupAt).toISOString().slice(0, 16)
        : '',
    );
    setEditComment(ride.comment ?? '');
    setEditFlight(ride.flight ?? '');
    setEditing(true);
  }

  async function saveEdit() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const pickupAt = editPickup
        ? new Date(editPickup).toISOString()
        : undefined;
      await api(`/rides/${params.id}`, {
        method: 'PATCH',
        token,
        body: JSON.stringify({
          ...(pickupAt ? { pickupAt } : {}),
          comment: editComment,
          flight: editFlight,
        }),
      });
      setEditing(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const from = ride
    ? {
        id: 'a',
        label: ride.fromLabel ?? 'A',
        lat: ride.fromLat ?? 0,
        lng: ride.fromLng ?? 0,
      }
    : null;
  const to =
    ride?.toLat != null && ride.toLng != null
      ? {
          id: 'b',
          label: ride.toLabel ?? 'B',
          lat: ride.toLat,
          lng: ride.toLng,
        }
      : null;
  const offers = useMemo(() => ride?.offers ?? [], [ride]);
  const waiting = ride?.status === 'WAITING_FOR_OFFERS';
  const canBook =
    ride?.status === 'OFFER_SELECTION' ||
    ride?.status === 'WAITING_FOR_OFFERS';
  const pq = quote?.paymentQuote;
  const partialOk =
    quote?.partialEnabled === true || pq?.partialEnabled === true;

  return (
    <div className="page-wrap">
      <SiteHeader onLogin={() => setAuthOpen(true)} />
      <div className="layout">
        <div className="form-col">
          <button
            className="linkish"
            type="button"
            onClick={() => router.push('/rides')}
          >
            ← My trips
          </button>
          <h1 style={{ marginTop: 8 }}>{friendlyRideStatus(ride?.status)}</h1>
          {ride && (
            <p className="muted">
              {ride.fromLabel} {ride.toLabel ? `→ ${ride.toLabel}` : ''}
              {ride.priceSnapshot?.distanceKm != null
                ? ` · ${ride.priceSnapshot.distanceKm} km`
                : ''}
              {ride.viewCount != null ? ` · ${ride.viewCount} views` : ''}
            </p>
          )}
          {error && <div className="error-banner">{error}</div>}
          {waiting && (
            <p className="muted">
              Drivers are bidding on your request. This page refreshes
              automatically.
            </p>
          )}

          <div className="card-list" style={{ marginTop: 16 }}>
            {offers.map((o: RideOffer) => {
              const p = o.presentation;
              const total =
                p?.passengerTotal ??
                o.priceSnapshot?.passengerTotal ??
                o.bidAmount;
              const title =
                p?.vehicleDisplayName ||
                o.vehicle?.name ||
                o.driver?.fullName ||
                'CAN-RIDE driver';
              const currency = o.currency ?? ride?.currency ?? 'USD';
              return (
                <div key={o.id} className="offer-card">
                  <div style={{ display: 'flex', gap: 12, flex: 1 }}>
                    {p?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.imageUrl}
                        alt={title}
                        style={{
                          width: 88,
                          height: 64,
                          objectFit: 'cover',
                          borderRadius: 8,
                        }}
                      />
                    ) : null}
                    <div>
                      <b>{title}</b>
                      <p className="muted" style={{ margin: '4px 0 0' }}>
                        {p?.vehicleClass ?? o.vehicleClass ?? 'Vehicle'}
                        {p?.passengers != null ? ` · ×${p.passengers}` : ''}
                        {p?.baggage != null ? ` · bags ×${p.baggage}` : ''}
                      </p>
                      {p?.rating && (
                        <p className="muted" style={{ margin: '4px 0 0' }}>
                          ★ {p.rating.overall?.toFixed(1) ?? '—'} (
                          {p.rating.count ?? 0})
                        </p>
                      )}
                      {!!p?.amenities?.length && (
                        <p className="muted" style={{ margin: '4px 0 0' }}>
                          {p.amenities
                            .slice(0, 3)
                            .map((a) => a.label)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                  </div>
                  <div>
                    <b>{formatMoney(total, currency)}</b>
                    {canBook && o.status === 'ACTIVE' && (
                      <button
                        className="cta"
                        style={{ marginTop: 8, height: 40, minWidth: 120 }}
                        disabled={busy}
                        onClick={() => openPay(o.id)}
                      >
                        Book
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {payingOfferId && pq && (
            <div className="offer-card" style={{ marginTop: 16, display: 'column', alignItems: 'stretch' }}>
              <h3 style={{ margin: 0 }}>Payment</h3>
              <label style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input
                  type="radio"
                  checked={paymentMode === 'FULL'}
                  onChange={() => refreshQuote('FULL')}
                />
                Pay in full now
              </label>
              {partialOk && (
                <label style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <input
                    type="radio"
                    checked={paymentMode === 'PARTIAL'}
                    onChange={() => refreshQuote('PARTIAL')}
                  />
                  Part now, rest in cash
                </label>
              )}
              <p style={{ marginTop: 12 }}>
                Total{' '}
                <b>{formatMoney(pq.totalAmount, pq.totalCurrency)}</b>
              </p>
              {paymentMode === 'PARTIAL' && (
                <>
                  <p>
                    Pay now{' '}
                    <b>{formatMoney(pq.onlineAmount, pq.onlineCurrency)}</b>
                  </p>
                  <p>
                    Cash to driver{' '}
                    <b>{formatMoney(pq.cashAmount, pq.cashCurrency)}</b>
                  </p>
                </>
              )}
              {quote?.cancellationPolicy?.body && (
                <p className="muted" style={{ marginTop: 8 }}>
                  {quote.cancellationPolicy.title ?? 'Cancellation policy'}:{' '}
                  {quote.cancellationPolicy.body}
                </p>
              )}
              <button
                className="cta"
                style={{ marginTop: 12 }}
                disabled={busy}
                onClick={confirmPay}
              >
                Pay {formatMoney(pq.onlineAmount, pq.onlineCurrency)}
              </button>
              <button
                className="linkish"
                type="button"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setPayingOfferId(null);
                  setQuote(null);
                }}
              >
                Cancel payment
              </button>
            </div>
          )}

          {ride &&
            (ride.canEdit === true ||
              ['WAITING_FOR_OFFERS', 'OFFER_SELECTION'].includes(ride.status)) && (
              <div style={{ marginTop: 12 }}>
                {!editing ? (
                  <button
                    className="linkish"
                    type="button"
                    disabled={busy}
                    onClick={startEdit}
                  >
                    Edit request
                  </button>
                ) : (
                  <div className="card" style={{ padding: 12 }}>
                    <label className="muted" style={{ display: 'block' }}>
                      Pickup
                      <input
                        type="datetime-local"
                        value={editPickup}
                        onChange={(e) => setEditPickup(e.target.value)}
                        style={{ display: 'block', width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <label
                      className="muted"
                      style={{ display: 'block', marginTop: 8 }}
                    >
                      Flight
                      <input
                        type="text"
                        value={editFlight}
                        onChange={(e) => setEditFlight(e.target.value)}
                        style={{ display: 'block', width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <label
                      className="muted"
                      style={{ display: 'block', marginTop: 8 }}
                    >
                      Comment
                      <textarea
                        value={editComment}
                        onChange={(e) => setEditComment(e.target.value)}
                        rows={3}
                        style={{ display: 'block', width: '100%', marginTop: 4 }}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                      <button
                        className="cta"
                        type="button"
                        disabled={busy}
                        onClick={saveEdit}
                      >
                        Save changes
                      </button>
                      <button
                        className="linkish"
                        type="button"
                        disabled={busy}
                        onClick={() => setEditing(false)}
                      >
                        Close
                      </button>
                    </div>
                    <p className="muted" style={{ marginTop: 8, fontSize: 12 }}>
                      Changing pickup time withdraws open offers so drivers can
                      rebid.
                    </p>
                  </div>
                )}
              </div>
            )}

          {ride &&
            (ride.canCancel === true ||
              [
                'WAITING_FOR_OFFERS',
                'OFFER_SELECTION',
                'PAYMENT_PENDING',
                'BOOKED',
                'DRIVER_EN_ROUTE',
                'DRIVER_ARRIVED',
              ].includes(ride.status)) && (
              <button
                className="linkish"
                type="button"
                disabled={busy}
                onClick={cancel}
                style={{ marginTop: 8 }}
              >
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
