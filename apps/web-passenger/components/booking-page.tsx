'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { toPickupIso } from '../lib/datetime';
import { searchPlaces } from '../lib/places';
import { DEFAULT_VEHICLE_IDS, VEHICLE_CLASSES } from '../lib/vehicles';
import type { ChildSeats, Place, Ride, ServiceType } from '../lib/types';
import { useAuth } from './auth-provider';
import { AuthModal } from './auth-modal';
import { MapPreview } from './map-preview';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { VehiclePhoto } from './vehicle-art';

const DURATION = [
  { minutes: 30, label: 'for 30min' },
  { minutes: 60, label: 'for 1hour' },
  { minutes: 120, label: 'for 2hours' },
  { minutes: 180, label: 'for 3hours' },
];

export function BookingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { token } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  const [service, setService] = useState<ServiceType>('RIDE');
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [perHourHasEnd, setPerHourHasEnd] = useState(false);
  const [vehicleIds, setVehicleIds] = useState<string[]>(DEFAULT_VEHICLE_IDS);
  const [pickupNow, setPickupNow] = useState(false);
  const [pickupValue, setPickupValue] = useState('');
  const [durationMin, setDurationMin] = useState(60);
  const [returnOn, setReturnOn] = useState(false);
  const [returnValue, setReturnValue] = useState('');
  const [adults, setAdults] = useState(2);
  const [childSeats, setChildSeats] = useState<ChildSeats>({
    infant: 0,
    child: 0,
    booster: 0,
  });
  const [childOpen, setChildOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [promoOn, setPromoOn] = useState(false);
  const [promo, setPromo] = useState('');
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queued, setQueued] = useState(false);

  useEffect(() => {
    const mode = searchParams.get('mode');
    if (mode === 'RIDE' || mode === 'PER_HOUR' || mode === 'DELIVERY') {
      setService(mode);
    }
    const cls = searchParams.get('class');
    if (cls && VEHICLE_CLASSES.some((v) => v.id === cls)) {
      setVehicleIds([cls]);
    }
    const fromText = searchParams.get('from');
    const toText = searchParams.get('to');
    if (fromText) {
      searchPlaces(fromText, 1)
        .then((list) => {
          if (list[0]) setFrom(list[0]);
        })
        .catch(() => undefined);
    }
    if (toText) {
      searchPlaces(toText, 1)
        .then((list) => {
          if (list[0]) setTo(list[0]);
        })
        .catch(() => undefined);
    }
    // Landing hero only needs an initial hydrate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showTo =
    service === 'RIDE' || service === 'DELIVERY' || (service === 'PER_HOUR' && perHourHasEnd);

  const commentChips =
    service === 'DELIVERY'
      ? ['Documents', 'Box 10 kg', 'Cargo delivery', 'Food']
      : service === 'PER_HOUR'
        ? ['Going out of the city', 'My route has several stops']
        : [];

  async function submitWith(accessToken: string) {
    if (!from) {
      setError('Please select a pickup location');
      return;
    }
    if (showTo && !to) {
      setError('Please select a destination');
      return;
    }
    if (!terms) {
      setError('Please accept the terms of the Service Agreement');
      return;
    }
    if (service !== 'DELIVERY' && vehicleIds.length === 0) {
      setError('Please select at least one vehicle class');
      return;
    }
    setBusy(true);
    try {
      const hours =
        service === 'PER_HOUR' ? Math.max(1, durationMin / 60) : undefined;
      const ride = await api<Ride>('/rides', {
        method: 'POST',
        token: accessToken,
        body: JSON.stringify({
          serviceType: service,
          fromLabel: from.label,
          toLabel: showTo ? to?.label : undefined,
          fromLat: from.lat,
          fromLng: from.lng,
          toLat: showTo ? to?.lat : undefined,
          toLng: showTo ? to?.lng : undefined,
          pickupAt: toPickupIso(pickupNow, pickupValue),
          vehicleClassIds: vehicleIds,
          adults: service === 'DELIVERY' ? undefined : adults,
          comment: comment || undefined,
          promoCode: promoOn && promo ? promo : undefined,
          hours,
        }),
      });
      router.push(`/rides/${ride.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    setError(null);
    if (!from) {
      setError('Please select a pickup location');
      return;
    }
    if (showTo && !to) {
      setError('Please select a destination');
      return;
    }
    if (!terms) {
      setError('Please accept the terms of the Service Agreement');
      return;
    }
    if (service !== 'DELIVERY' && vehicleIds.length === 0) {
      setError('Please select at least one vehicle class');
      return;
    }
    if (!token) {
      setQueued(true);
      setAuthOpen(true);
      return;
    }
    void submitWith(token);
  }

  useEffect(() => {
    if (token && queued) {
      setQueued(false);
      void submitWith(token);
    }
    // Form snapshot is captured when queued; token arrival triggers submit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, queued]);

  function toggleVehicle(id: string) {
    setVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  const childTotal = childSeats.infant + childSeats.child + childSeats.booster;

  return (
    <div className="page-wrap">
      <SiteHeader onLogin={() => setAuthOpen(true)} />
      <section className="hero">
        <h1>Best Prices From The Best Drivers In All Countries</h1>
        <div className="pills-row">
          {['Transfers', 'Intercity', 'Rides', 'Delivery', 'Tender-Based Pricing'].map(
            (item) => (
              <span key={item}>
                <span className="check">✓</span> {item}
              </span>
            ),
          )}
        </div>
      </section>

      <div className="layout">
        <div className="form-col">
          <div className="tabs">
            <Tab
              active={service === 'RIDE'}
              onClick={() => setService('RIDE')}
              icon={<RideIcon />}
              label="Ride"
            />
            <Tab
              active={service === 'PER_HOUR'}
              onClick={() => setService('PER_HOUR')}
              icon={<ClockIcon />}
              label="Per hour"
            />
            <Tab
              active={service === 'DELIVERY'}
              onClick={() => setService('DELIVERY')}
              icon={<BoxIcon />}
              label="Delivery"
            />
          </div>

          <PlaceField
            letter="A"
            placeholder="From: address, airport, hotel"
            value={from}
            onChange={setFrom}
          />
          {service === 'PER_HOUR' && (
            <ToggleRow
              label="End at another location"
              on={perHourHasEnd}
              onChange={setPerHourHasEnd}
            />
          )}
          {showTo && (
            <>
              <div className="route-join">↓</div>
              <PlaceField
                letter="B"
                placeholder="To: address, airport, hotel"
                value={to}
                onChange={setTo}
              />
            </>
          )}

          {service !== 'DELIVERY' && (
            <>
              <div className="vehicle-legend">
                <span>Vehicle class</span>
                <small>
                  {vehicleIds.length
                    ? `${vehicleIds.length} selected`
                    : 'None selected — tap the cars you want bids for'}
                </small>
              </div>
              <div className="vehicle-grid">
                {VEHICLE_CLASSES.map((vc) => {
                  const on = vehicleIds.includes(vc.id);
                  return (
                    <button
                      key={vc.id}
                      type="button"
                      className={`vcard ${on ? 'selected' : ''}`}
                      onClick={() => toggleVehicle(vc.id)}
                      aria-pressed={on}
                    >
                      {on && <span className="vcard-check">✓</span>}
                      <VehiclePhoto id={vc.id} name={vc.name} />
                      <b>{vc.name}</b>
                      <em>{vc.fromPrice}</em>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="field">
            <CalendarIcon />
            <input
              type="datetime-local"
              value={pickupNow ? '' : pickupValue}
              onChange={(e) => {
                setPickupNow(false);
                setPickupValue(e.target.value);
              }}
              aria-label="Pick-up date & time"
            />
            <button
              type="button"
              className={`now-btn ${pickupNow ? '' : 'idle'}`}
              onClick={() => {
                setPickupNow(true);
                setPickupValue('');
              }}
            >
              Now
            </button>
          </div>

          {service === 'PER_HOUR' && (
            <>
              <div className="field">
                <CalendarIcon />
                <span className={durationMin ? '' : 'muted'}>Ride ends</span>
              </div>
              <div className="chips">
                {DURATION.map((d) => (
                  <button
                    key={d.minutes}
                    type="button"
                    className={`chip ${durationMin === d.minutes ? 'on' : ''}`}
                    onClick={() => setDurationMin(d.minutes)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {service === 'RIDE' && (
            <ToggleRow label="Add return way" on={returnOn} onChange={setReturnOn} />
          )}
          {service === 'RIDE' && returnOn && (
            <div className="field">
              <CalendarIcon />
              <input
                type="datetime-local"
                value={returnValue}
                onChange={(e) => setReturnValue(e.target.value)}
                aria-label="Return ride date & time"
              />
            </div>
          )}

          {service !== 'DELIVERY' && (
            <>
              <div className="row-line">
                <PersonIcon />
                <span className="grow">Adults</span>
                <div className="stepper">
                  <button type="button" onClick={() => setAdults((n) => Math.max(1, n - 1))}>
                    −
                  </button>
                  <b>{adults}</b>
                  <button type="button" onClick={() => setAdults((n) => Math.min(20, n + 1))}>
                    +
                  </button>
                </div>
              </div>
              <div className="row-line">
                <ChildIcon />
                <span className="grow">
                  Children{childTotal ? ` (${childTotal})` : ''}
                </span>
                <button type="button" className="edit-link" onClick={() => setChildOpen(true)}>
                  Edit
                </button>
              </div>
            </>
          )}

          <div className="field textarea">
            <ChatIcon />
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={
                service === 'DELIVERY'
                  ? 'Please specify weight, dimensions and contents of your delivery'
                  : 'Luggage information, special needs or tasks for the driver'
              }
            />
          </div>
          {commentChips.length > 0 && (
            <div className="chips">
              {commentChips.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="chip"
                  onClick={() =>
                    setComment((prev) => (prev.includes(c) ? prev : prev ? `${prev}. ${c}` : c))
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <ToggleRow label="I have a promo code" on={promoOn} onChange={setPromoOn} />
          {promoOn && (
            <div className="field">
              <input
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                placeholder="Enter promo code"
              />
            </div>
          )}
          <ToggleRow
            label={
              <>
                I accept the terms of{' '}
                <a href="/terms" style={{ color: 'var(--brand)' }}>
                  Service Agreement
                </a>
              </>
            }
            on={terms}
            onChange={setTerms}
          />

          {error && <div className="error-banner">{error}</div>}
          <button className="cta" type="button" disabled={busy} onClick={submit}>
            {busy ? 'Submitting…' : 'Get offers'}
          </button>
        </div>

        <aside className="side-col">
          <MapPreview from={from} to={showTo ? to : null} />
          <div className="price-match">
            <div className="pm-icon">✓</div>
            <div>
              <h3>We price match: return the difference in price</h3>
              <p>
                You can claim a refund of the difference in price, if you find a similar
                offer on another site at a lower price.{' '}
                <a href="/faq">Read more</a>
              </p>
            </div>
          </div>
        </aside>
      </div>

      <SiteFooter />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      {childOpen && (
        <div className="modal-backdrop" onClick={() => setChildOpen(false)} role="presentation">
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ marginTop: 0 }}>Child seats</h2>
            <SeatRow
              label="Infant seat"
              value={childSeats.infant}
              onChange={(v) => setChildSeats((s) => ({ ...s, infant: v }))}
            />
            <SeatRow
              label="Child seat"
              value={childSeats.child}
              onChange={(v) => setChildSeats((s) => ({ ...s, child: v }))}
            />
            <SeatRow
              label="Booster"
              value={childSeats.booster}
              onChange={(v) => setChildSeats((s) => ({ ...s, booster: v }))}
            />
            <button className="cta" type="button" onClick={() => setChildOpen(false)}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Tab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button type="button" className={`tab ${active ? 'active' : ''}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function ToggleRow({
  label,
  on,
  onChange,
}: {
  label: ReactNode;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="row-line">
      <span className="grow">{label}</span>
      <button
        type="button"
        className={`toggle ${on ? 'on' : ''}`}
        aria-pressed={on}
        aria-label={typeof label === 'string' ? label : 'Toggle'}
        onClick={() => onChange(!on)}
      />
    </div>
  );
}

function SeatRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="row-line">
      <span className="grow">{label}</span>
      <div className="stepper">
        <button type="button" onClick={() => onChange(Math.max(0, value - 1))}>
          −
        </button>
        <b>{value}</b>
        <button type="button" onClick={() => onChange(Math.min(5, value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

function PlaceField({
  letter,
  placeholder,
  value,
  onChange,
}: {
  letter: string;
  placeholder: string;
  value: Place | null;
  onChange: (p: Place | null) => void;
}) {
  const [q, setQ] = useState(value?.label ?? '');
  const [hits, setHits] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setQ(value?.label ?? '');
  }, [value]);

  useEffect(() => {
    if (q.trim().length < 2 || (value && q === value.label)) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      searchPlaces(q)
        .then(setHits)
        .catch(() => setHits([]));
    }, 280);
    return () => clearTimeout(t);
  }, [q, value]);

  return (
    <div className="field">
      <span className="point">{letter}</span>
      <input
        value={q}
        placeholder={placeholder}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          if (value) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
      />
      {value && (
        <button
          type="button"
          className="icon-btn"
          aria-label="Clear"
          onClick={() => {
            onChange(null);
            setQ('');
            setHits([]);
          }}
        >
          ×
        </button>
      )}
      {open && hits.length > 0 && (
        <div className="suggest">
          {hits.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p);
                setQ(p.label);
                setHits([]);
                setOpen(false);
              }}
            >
              {p.label}
              {p.subtitle && <small>{p.subtitle}</small>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RideIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 12h10M14 12l-3-3M14 12l-3 3M20 7v10" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </svg>
  );
}
function BoxIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 8l8-4 8 4v8l-8 4-8-4V8z" />
      <path d="M12 12V4M4 8l8 4 8-4" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8">
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 4v4M16 4v4M4 11h16" />
    </svg>
  );
}
function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19c.8-3.2 3.2-5 6.5-5s5.7 1.8 6.5 5" />
    </svg>
  );
}
function ChildIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8">
      <circle cx="12" cy="9" r="3" />
      <path d="M7 20c.6-3 2.4-4.5 5-4.5S16.4 17 17 20M16 6.2c1.4.4 2.4 1.6 2.4 3.2" />
    </svg>
  );
}
function ChatIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8">
      <path d="M5 17.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-4 3.2z" />
    </svg>
  );
}
