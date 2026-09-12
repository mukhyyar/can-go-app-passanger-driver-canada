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
    <div className="phone-mock" aria-label="CAN-RIDE app preview">
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
        <img src="/brand/can-ride-mark.png" alt="" width={22} height={22} />
       
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
        <iframe
          title="Google Maps preview"
          className="phone-map-iframe"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src="https://maps.google.com/maps?saddr=43.6777,-79.6248&daddr=43.6532,-79.3832&hl=en&z=11&output=embed"
        />
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
        <iframe
          title="Google Maps live track"
          className="phone-track-iframe"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src="https://maps.google.com/maps?saddr=43.6777,-79.6248&daddr=43.6532,-79.3832&hl=en&z=11&output=embed"
        />

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
