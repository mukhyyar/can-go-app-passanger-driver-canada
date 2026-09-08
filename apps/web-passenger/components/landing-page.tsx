'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { searchPlaces } from '../lib/places';
import { VEHICLE_CLASSES, vehicleImage } from '../lib/vehicles';
import type { Place } from '../lib/types';
import { AppPhoneMock } from './app-phone-mock';
import { AuthModal } from './auth-modal';
import { SiteFooter } from './site-footer';
import { SiteHeader } from './site-header';
import { TestimonialsSlider } from './testimonials-slider';

type Mode = 'RIDE' | 'PER_HOUR';
type Field = 'from' | 'to';

const STEPS = [
  {
    n: '01',
    title: 'Request your trip',
    text: 'Pickup, drop-off, time, and the vehicle classes you want. No surge meter — you open a tender.',
  },
  {
    n: '02',
    title: 'Compare driver bids',
    text: 'Nearby drivers send offers with the car photo, hospitality score, and their price.',
  },
  {
    n: '03',
    title: 'Pay the offer you pick',
    text: 'Choose price, vehicle, and driver. Pay only after you accept. Track the ride live.',
  },
];

const WHY = [
  {
    title: 'See the car before you pay',
    text: 'Every bid includes the actual vehicle. No mystery sedan at the curb.',
  },
  {
    title: 'You run the marketplace',
    text: 'Drivers compete. You pick the bid that fits — fare, car class, and hospitality.',
  },
  {
    title: 'Hospitality, scored',
    text: 'Travelers rate drivers on greeting, luggage help, and the ride — not just stars.',
  },
  {
    title: 'Price match',
    text: 'Find a similar offer cheaper elsewhere and claim the difference after the trip.',
  },
];

const ROUTES = [
  { from: 'Toronto Pearson (YYZ)', to: 'Downtown Toronto', city: 'Toronto' },
  { from: 'Vancouver International (YVR)', to: 'Downtown Vancouver', city: 'Vancouver' },
  { from: 'Montréal-Trudeau (YUL)', to: 'Downtown Montréal', city: 'Montréal' },
  { from: 'Calgary International (YYC)', to: 'Downtown Calgary', city: 'Calgary' },
  { from: 'Dubai International (DXB)', to: 'Downtown Dubai', city: 'Dubai' },
  { from: 'London Heathrow (LHR)', to: 'Central London', city: 'London' },
];

export function LandingPage() {
  const router = useRouter();
  const [authOpen, setAuthOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('RIDE');
  const [fromQ, setFromQ] = useState('');
  const [toQ, setToQ] = useState('');
  const [active, setActive] = useState<Field | null>(null);
  const [hints, setHints] = useState<Place[]>([]);
  const [swapping, setSwapping] = useState(false);

  useEffect(() => {
    const q = active === 'from' ? fromQ : active === 'to' ? toQ : '';
    if (q.trim().length < 2) {
      setHints([]);
      return;
    }
    const t = window.setTimeout(() => {
      searchPlaces(q)
        .then(setHints)
        .catch(() => setHints([]));
    }, 280);
    return () => window.clearTimeout(t);
  }, [active, fromQ, toQ]);

  function pick(place: Place) {
    if (active === 'from') {
      setFromQ(place.label);
    } else if (active === 'to') {
      setToQ(place.label);
    }
    setHints([]);
    setActive(null);
  }

  function swap() {
    setSwapping(true);
    const aq = fromQ;
    setFromQ(toQ);
    setToQ(aq);
    window.setTimeout(() => setSwapping(false), 320);
  }

  function goBook(extra?: Record<string, string>) {
    const params = new URLSearchParams();
    params.set('mode', mode);
    if (fromQ.trim()) params.set('from', fromQ.trim());
    if (toQ.trim()) params.set('to', toQ.trim());
    if (extra) {
      Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    }
    router.push(`/book?${params.toString()}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    goBook();
  }

  const showTo = mode === 'RIDE';

  return (
    <div className="page-wrap lp">
      <SiteHeader onLogin={() => setAuthOpen(true)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />

      <section className="lp-hero">
        <div className="lp-hero-shade" />
        <div className="lp-hero-inner">
          <p className="lp-eyebrow">Marketplace transfers · Canada and beyond</p>
          <h1>Your next adventure starts here</h1>
          <p className="hero-sub">
            Compare trusted driver offers. See the car before you pay. Choose the
            price, the vehicle, and who drives — airport, intercity, or by the hour.
          </p>

          <form
            className={`lp-search${showTo ? '' : ' is-hourly'}${swapping ? ' is-swapping' : ''}`}
            onSubmit={onSubmit}
            data-mode={mode}
          >
            <div className="lp-search-chrome">
              <div className="mode-toggle" role="tablist" aria-label="Trip type">
                <span
                  className="mode-thumb"
                  aria-hidden
                  data-pos={mode === 'RIDE' ? 'ride' : 'hour'}
                />
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'RIDE'}
                  className={mode === 'RIDE' ? 'on' : ''}
                  onClick={() => setMode('RIDE')}
                >
                  <RideIcon />
                  Transfer
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'PER_HOUR'}
                  className={mode === 'PER_HOUR' ? 'on' : ''}
                  onClick={() => setMode('PER_HOUR')}
                >
                  <ClockIcon />
                  Hourly
                </button>
              </div>
              <p className="lp-search-hint" key={mode}>
                {showTo
                  ? 'A to B — compare driver bids on your route'
                  : 'Hire by the hour — set pickup, pick duration next'}
              </p>
            </div>

            <div className="search-bar">
              <div className="search-panel">
                <label
                  className={`search-field search-field-from${active === 'from' ? ' is-active' : ''}${fromQ ? ' has-value' : ''}`}
                >
                  <span className="search-field-icon" aria-hidden>
                    <span className="search-pin search-pin-from" />
                  </span>
                  <span className="search-field-body">
                    <span className="search-label">
                      {showTo ? 'Pickup' : 'Meet me at'}
                    </span>
                    <input
                      value={fromQ}
                      onChange={(e) => {
                        setFromQ(e.target.value);
                        setActive('from');
                      }}
                      onFocus={() => setActive('from')}
                      onBlur={() => {
                        window.setTimeout(() => {
                          setActive((cur) => (cur === 'from' ? null : cur));
                        }, 140);
                      }}
                      placeholder={
                        showTo
                          ? 'Airport, hotel, or address'
                          : 'Airport, hotel, or address'
                      }
                      autoComplete="off"
                      aria-autocomplete="list"
                    />
                  </span>
                  {active === 'from' && hints.length > 0 && (
                    <div className="suggest" role="listbox">
                      {hints.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pick(p)}
                        >
                          <PinIcon />
                          <span>
                            {p.label}
                            {p.subtitle && <small>{p.subtitle}</small>}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </label>

                {showTo && (
                  <>
                    <button
                      className="swap-btn"
                      type="button"
                      aria-label="Swap locations"
                      onClick={swap}
                    >
                      <SwapIcon />
                    </button>
                    <label
                      className={`search-field search-field-to${active === 'to' ? ' is-active' : ''}${toQ ? ' has-value' : ''}`}
                    >
                      <span className="search-field-icon" aria-hidden>
                        <span className="search-pin search-pin-to" />
                      </span>
                      <span className="search-field-body">
                        <span className="search-label">Drop-off</span>
                        <input
                          value={toQ}
                          onChange={(e) => {
                            setToQ(e.target.value);
                            setActive('to');
                          }}
                          onFocus={() => setActive('to')}
                          onBlur={() => {
                            window.setTimeout(() => {
                              setActive((cur) => (cur === 'to' ? null : cur));
                            }, 140);
                          }}
                          placeholder="Where are you going?"
                          autoComplete="off"
                          aria-autocomplete="list"
                        />
                      </span>
                      {active === 'to' && hints.length > 0 && (
                        <div className="suggest" role="listbox">
                          {hints.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              role="option"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => pick(p)}
                            >
                              <PinIcon />
                              <span>
                                {p.label}
                                {p.subtitle && <small>{p.subtitle}</small>}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </label>
                  </>
                )}
              </div>

              <button className="get-offers" type="submit">
                <span>Get offers</span>
                <ArrowIcon />
              </button>
            </div>
          </form>

          <ul className="hero-trust">
            <li>
              <Check /> Tender-based pricing
            </li>
            <li>
              <Check /> Real vehicle photos
            </li>
            <li>
              <Check /> Up to 60 min waiting
            </li>
            <li>
              <Check /> Price match
            </li>
          </ul>
        </div>
      </section>

      <section className="lp-section" id="how">
        <p className="lp-kicker">How it works</p>
        <h2>Request. Compare. Ride.</h2>
        <p className="lp-lead">
          CAN-GO is a marketplace — not auto-dispatch. Drivers bid. You decide.
        </p>
        <div className="how-grid">
          {STEPS.map((s) => (
            <article key={s.n} className="how-card">
              <span className="how-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-section-flush" id="classes">
        <p className="lp-kicker">Fleet</p>
        <h2>Choose your class</h2>
        <p className="lp-lead">
          From everyday Economy to VIP and coaches — tap a class to start a request.
        </p>
        <div className="class-row">
          {VEHICLE_CLASSES.map((vc) => (
            <Link
              key={vc.id}
              href={`/book?mode=RIDE&class=${vc.id}`}
              className="class-card"
            >
              <div className="class-photo">
                <img src={vehicleImage(vc.id)} alt={`${vc.name} vehicle`} />
              </div>
              <strong>{vc.name}</strong>
              <span className="class-meta">
                {vc.seats} seats · {vc.fromPrice}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="lp-why" id="why">
        <div className="lp-why-inner">
          <div className="lp-why-copy">
            <p className="lp-kicker light">Why CAN-GO</p>
            <h2>A transfer you actually choose</h2>
            <p>
              Other apps assign a car. On CAN-GO you open a tender, wait for bids,
              and accept the offer that looks right — fare, vehicle, and driver
              included.
            </p>
            <Link href="/book" className="btn-book solid">
              Start a request
            </Link>
          </div>
          <div className="why-grid">
            {WHY.map((w) => (
              <article key={w.title} className="why-card">
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-section" id="destinations">
        <p className="lp-kicker">Popular routes</p>
        <h2>Airport to city, ready to bid</h2>
        <p className="lp-lead">
          Prefill a classic airport run, then pick vehicle classes on the next screen.
        </p>
        <div className="dest-grid">
          {ROUTES.map((r) => (
            <Link
              key={r.city}
              className="dest-card"
              href={`/book?mode=RIDE&from=${encodeURIComponent(r.from)}&to=${encodeURIComponent(r.to)}`}
            >
              <span className="dest-city">{r.city}</span>
              <span className="dest-route">
                {r.from} <span aria-hidden>→</span> {r.to}
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="lp-section" id="app">
        <div className="app-banner" id="drivers">
          <div className="app-banner-bg" aria-hidden>
            <span className="app-banner-wash" />
            <span className="app-banner-grid" />
          </div>

          <div className="app-visual">
            <div className="app-phone-stage">
              <div className="app-phone-wrap">
                <AppPhoneMock />
              </div>
            </div>
          </div>

          <div className="app-copy">
            <p className="lp-kicker light">Mobile</p>
            <h2>
              Download the <em>CAN-GO</em> app
            </h2>
            <p className="app-lead">
              Book on the go with live tracking and marketplace bids in your pocket.
            </p>

            <ul className="app-feature-list">
              <li>
                <Check /> Easy booking
              </li>
              <li>
                <Check /> Real-time tracking
              </li>
              <li>
                <Check /> Driver photos before you pay
              </li>
            </ul>

            <div className="app-actions">
              <div className="app-store-row">
                <a className="store-btn" href="#app" aria-label="Download on the App Store">
                  <AppleMark />
                  <span>
                    <small>Download on the</small>
                    App Store
                  </span>
                </a>
                <a className="store-btn" href="#app" aria-label="Get it on Google Play">
                  <PlayMark />
                  <span>
                    <small>Get it on</small>
                    Google Play
                  </span>
                </a>
              </div>
              <a className="download-btn" href="/book">
                Get offers on the web
                <span className="download-btn-arrow" aria-hidden>
                  →
                </span>
              </a>
            </div>

            <div className="app-qr-row">
              <div className="qr" aria-hidden>
                <QrMark />
              </div>
              <p>
                Scan to open
                <span>Works on iOS &amp; Android</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      <TestimonialsSlider />

      <SiteFooter />
    </div>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#B41B1D" />
      <path
        d="M4.6 8.2 7 10.6l4.6-5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M4 16c4-8 12-8 16 0" />
      <circle cx="5" cy="16" r="1.6" fill="currentColor" />
      <circle cx="19" cy="16" r="1.6" fill="currentColor" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 8v4.2l3 1.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        d="M7 8h11M15 5l3 3-3 3M17 16H6M9 13l-3 3 3 3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
      <path
        d="M5 12h12M13 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="suggest-pin">
      <path
        fill="currentColor"
        d="M12 2.5c-3.2 0-5.8 2.5-5.8 5.7 0 4.2 5.8 13.3 5.8 13.3s5.8-9.1 5.8-13.3c0-3.2-2.6-5.7-5.8-5.7zm0 8a2.3 2.3 0 1 1 0-4.6 2.3 2.3 0 0 1 0 4.6z"
      />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M16.7 12.6c0-2.2 1.8-3.3 1.9-3.4-1-1.5-2.6-1.7-3.2-1.7-1.4-.1-2.6.8-3.3.8-.7 0-1.7-.8-2.9-.8-1.5 0-2.8.9-3.6 2.2-1.5 2.7-.4 6.6 1.1 8.8.7 1 1.6 2.2 2.7 2.2 1.1 0 1.5-.7 2.8-.7s1.7.7 2.8.7c1.2 0 1.9-1 2.6-2 .8-1.2 1.1-2.3 1.1-2.4-.1 0-2.1-.8-2.1-3.7zm-2-6.5c.6-.7 1-1.7.9-2.7-0.9.1-1.9.6-2.5 1.3-.6.6-1.1 1.6-1 2.6 1 .1 1.9-.5 2.6-1.2z"
      />
    </svg>
  );
}

function PlayMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path fill="#34A853" d="M3.2 21.1 12.6 12 3.2 2.9v18.2z" />
      <path fill="#4285F4" d="m12.6 12 2.4-2.4 5.6 3.2c.6.4.6 1.2 0 1.5l-5.6 3.2L12.6 12z" />
      <path fill="#FBBC04" d="M3.2 21.1c.3.5.9.6 1.5.3L15 15.1 12.6 12 3.2 21.1z" />
      <path fill="#EA4335" d="M15 8.9 4.7 2.6C4.1 2.3 3.5 2.4 3.2 2.9L12.6 12 15 8.9z" />
    </svg>
  );
}

function QrMark() {
  return (
    <svg viewBox="0 0 29 29" width="72" height="72">
      <rect width="29" height="29" fill="#fff" />
      <g fill="#1a1a1a">
        <rect x="2" y="2" width="8" height="8" />
        <rect x="19" y="2" width="8" height="8" />
        <rect x="2" y="19" width="8" height="8" />
        <rect x="4" y="4" width="4" height="4" fill="#fff" />
        <rect x="21" y="4" width="4" height="4" fill="#fff" />
        <rect x="4" y="21" width="4" height="4" fill="#fff" />
        <rect x="5" y="5" width="2" height="2" />
        <rect x="22" y="5" width="2" height="2" />
        <rect x="5" y="22" width="2" height="2" />
        <rect x="12" y="2" width="2" height="2" />
        <rect x="16" y="4" width="2" height="2" />
        <rect x="13" y="7" width="3" height="2" />
        <rect x="12" y="12" width="2" height="2" />
        <rect x="16" y="12" width="2" height="5" />
        <rect x="19" y="14" width="3" height="2" />
        <rect x="23" y="12" width="4" height="2" />
        <rect x="12" y="16" width="2" height="4" />
        <rect x="20" y="18" width="2" height="2" />
        <rect x="24" y="17" width="3" height="3" />
        <rect x="19" y="22" width="2" height="5" />
        <rect x="23" y="24" width="4" height="3" />
        <rect x="13" y="22" width="4" height="2" />
        <rect x="12" y="26" width="2" height="2" />
      </g>
    </svg>
  );
}
