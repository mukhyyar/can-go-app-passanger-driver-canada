'use client';

import { useEffect, useState } from 'react';

const SCREENS = ['book', 'offers', 'track'] as const;
type Screen = (typeof SCREENS)[number];

const OFFERS = [
  {
    id: 'economy',
    name: 'Economy',
    driver: 'Marcus · 4.9',
    price: 'US$42',
    img: '/vehicles/economy.png',
  },
  {
    id: 'comfort',
    name: 'Comfort',
    driver: 'Aisha · 5.0',
    price: 'US$58',
    img: '/vehicles/comfort.png',
  },
  {
    id: 'business',
    name: 'Business',
    driver: 'Daniel · 4.8',
    price: 'US$79',
    img: '/vehicles/business.png',
  },
];

export function AppPhoneMock() {
  const [screen, setScreen] = useState<Screen>('book');
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    const onChange = () => setReduceMotion(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setScreen((cur) => {
        const i = SCREENS.indexOf(cur);
        return SCREENS[(i + 1) % SCREENS.length];
      });
    }, 3600);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <div className="phone-mock" aria-label="CAN-GO app preview">
      <div className="phone-mock-glow" aria-hidden />
      <div className="phone-mock-device">
        <div className="phone-mock-bezel">
          <div className="phone-mock-island" aria-hidden />
          <div className="phone-mock-screen">
            <div className="phone-status">
              <span>9:41</span>
              <span className="phone-status-icons" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </div>

            <div className="phone-slides" data-screen={screen}>
              <ScreenBook active={screen === 'book'} />
              <ScreenOffers active={screen === 'offers'} />
              <ScreenTrack active={screen === 'track'} />
            </div>

            <nav className="phone-tabbar" aria-hidden>
              <span className={screen === 'book' ? 'on' : ''}>Book</span>
              <span className={screen === 'offers' ? 'on' : ''}>Offers</span>
              <span>Rides</span>
              <span className={screen === 'track' ? 'on' : ''}>Live</span>
            </nav>
          </div>
        </div>
      </div>

      <div className="phone-mock-dots" role="tablist" aria-label="App preview screens">
        {SCREENS.map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-label={
              s === 'book' ? 'Book screen' : s === 'offers' ? 'Offers screen' : 'Live tracking'
            }
            aria-selected={screen === s}
            className={screen === s ? 'on' : ''}
            onClick={() => setScreen(s)}
          />
        ))}
      </div>
    </div>
  );
}

function ScreenBook({ active }: { active: boolean }) {
  return (
    <article className={`phone-slide phone-slide-book${active ? ' is-active' : ''}`}>
      <header className="phone-book-head">
        <img src="/brand/can-go-mark.png" alt="" width={22} height={22} />
        <div>
          <strong>CAN-GO</strong>
          <small>Book your next transfer</small>
        </div>
      </header>

      <div className="phone-chips">
        <span className="on">Ride</span>
        <span>Per hour</span>
      </div>

      <div className="phone-route-card">
        <div className="phone-route-rail" aria-hidden>
          <i className="a" />
          <span />
          <i className="b" />
        </div>
        <div className="phone-route-copy">
          <p>
            <em>From</em>
            Toronto Pearson (YYZ)
          </p>
          <p>
            <em>To</em>
            Downtown Toronto
          </p>
        </div>
      </div>

      <div className="phone-class-row">
        {['economy', 'comfort', 'business'].map((id, i) => (
          <div key={id} className={`phone-class${i === 0 ? ' on' : ''}`}>
            <img src={`/vehicles/${id}.png`} alt="" />
            <strong>{id[0].toUpperCase() + id.slice(1)}</strong>
          </div>
        ))}
      </div>

      <div className="phone-map">
        <svg viewBox="0 0 220 120" className="phone-map-svg" aria-hidden>
          <defs>
            <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#B41B1D" />
              <stop offset="100%" stopColor="#8E1517" />
            </linearGradient>
          </defs>
          <path
            className="phone-map-path"
            d="M28 88 C 60 30, 120 20, 190 42"
            fill="none"
            stroke="url(#routeGrad)"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <circle cx="28" cy="88" r="6" fill="#1a1a1a" />
          <circle cx="190" cy="42" r="6" fill="#B41B1D" />
          <g className="phone-map-car">
            <rect x="-7" y="-4" width="14" height="8" rx="2.5" fill="#1a1a1a" />
            <rect x="-4" y="-2.5" width="6" height="5" rx="1" fill="#555" />
          </g>
        </svg>
      </div>

      <button type="button" className="phone-cta">
        Get offers
      </button>
    </article>
  );
}

function ScreenOffers({ active }: { active: boolean }) {
  return (
    <article className={`phone-slide phone-slide-offers${active ? ' is-active' : ''}`}>
      <header className="phone-offers-head">
        <strong>Offers</strong>
        <small>YYZ → Downtown · 3 bids</small>
      </header>

      <ul className="phone-offer-list">
        {OFFERS.map((o, i) => (
          <li key={o.id} className={i === 0 ? 'featured' : ''}>
            <img src={o.img} alt="" />
            <div>
              <strong>{o.name}</strong>
              <small>{o.driver}</small>
            </div>
            <div className="phone-offer-price">
              <b>{o.price}</b>
              <span>BOOK</span>
            </div>
          </li>
        ))}
      </ul>
    </article>
  );
}

function ScreenTrack({ active }: { active: boolean }) {
  return (
    <article className={`phone-slide phone-slide-track${active ? ' is-active' : ''}`}>
      <div className="phone-track-map">
        <svg viewBox="0 0 220 260" className="phone-track-svg" aria-hidden>
          <path
            d="M40 210 C 70 150, 90 120, 120 90 S 170 40, 185 28"
            fill="none"
            stroke="#B41B1D"
            strokeWidth="4"
            strokeLinecap="round"
            className="phone-track-path"
          />
          <circle cx="40" cy="210" r="7" fill="#1a1a1a" />
          <circle cx="185" cy="28" r="7" fill="#B41B1D" />
          <g className="phone-track-car">
            <rect x="-9" y="-5" width="18" height="10" rx="3" fill="#1a1a1a" />
            <rect x="-5" y="-3" width="8" height="6" rx="1.5" fill="#666" />
          </g>
        </svg>

        <div className="phone-track-card">
          <img src="/vehicles/comfort.png" alt="" />
          <div>
            <strong>Comfort · Marcus</strong>
            <small>Arriving in 4 min · live tracking</small>
          </div>
          <span className="phone-pulse" aria-hidden />
        </div>
      </div>
    </article>
  );
}
