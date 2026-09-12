'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';

const REVIEWS = [
  {
    name: 'Priya S.',
    source: 'CAN-RIDE',
    text: 'Driver sent photos before I paid. The Comfort class was exactly what I booked from YYZ to downtown.',
  },
  {
    name: 'Daniel M.',
    source: 'CAN-RIDE',
    text: 'Several bids came in within minutes. I picked the price and the car — no surge surprise at the airport.',
  },
  {
    name: 'Amélie R.',
    source: 'CAN-RIDE',
    text: 'Per-hour for a city day worked perfectly. Clear hospitality score and a clean van for our family.',
  },
  {
    name: 'Omar K.',
    source: 'CAN-RIDE',
    text: 'Compared three offers, chose VIP, and the meet-and-greet was waiting with a sign. Smooth from start to finish.',
  },
  {
    name: 'Hannah L.',
    source: 'CAN-RIDE',
    text: 'Booked an intercity transfer. Real vehicle photos, fair bid, and the driver arrived early.',
  },
  {
    name: 'James T.',
    source: 'CAN-RIDE',
    text: 'I like that CAN-RIDE is a marketplace. I am not stuck with one fare — I choose who I ride with.',
  },
  {
    name: 'Sofia N.',
    source: 'CAN-RIDE',
    text: 'The app tracking matched the web booking. Hospitality rating was honest — our driver earned it.',
  },
  {
    name: 'Wei C.',
    source: 'CAN-RIDE',
    text: 'Airport pickup after a long flight. Economy class, fair price, and no haggling at the curb.',
  },
];

function initials(name: string) {
  const parts = name.replace(/\./g, '').split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function TestimonialsSlider() {
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = REVIEWS.length;
  const featured = REVIEWS[index] ?? REVIEWS[0];

  const goTo = useCallback((next: number) => {
    const clamped = ((next % count) + count) % count;
    setIndex(clamped);
    const track = trackRef.current;
    const card = track?.children[clamped] as HTMLElement | undefined;
    if (track && card) {
      const left = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
      track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }, [count]);

  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const next = useCallback(() => goTo(index + 1), [goTo, index]);

  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      setIndex((i) => {
        const n = (i + 1) % count;
        const track = trackRef.current;
        const card = track?.children[n] as HTMLElement | undefined;
        if (track && card) {
          const left = card.offsetLeft - (track.clientWidth - card.clientWidth) / 2;
          track.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
        }
        return n;
      });
    }, 5500);
    return () => window.clearInterval(id);
  }, [paused, count]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const cards = Array.from(track.children) as HTMLElement[];
        if (!cards.length) return;
        const mid = track.scrollLeft + track.clientWidth / 2;
        let best = 0;
        let bestDist = Infinity;
        cards.forEach((card, i) => {
          const center = card.offsetLeft + card.clientWidth / 2;
          const dist = Math.abs(center - mid);
          if (dist < bestDist) {
            bestDist = dist;
            best = i;
          }
        });
        setIndex(best);
      });
    };

    track.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener('scroll', onScroll);
    };
  }, []);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(count - 1);
    }
  }

  return (
    <section
      className="lp-section testimonials"
      id="reviews"
      aria-labelledby={labelId}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <p className="lp-kicker">Travelers</p>
      <h2 id={labelId}>Reviews from the road</h2>
      <p className="lp-lead">
        Airport runs, intercity trips, and hourly charters — here is what riders say.
      </p>

      <blockquote className="testimonials-featured" aria-live="polite">
        <span className="testimonials-mark" aria-hidden>
          “
        </span>
        <p>{featured.text}</p>
        <footer>
          <span className="testimonials-avatar" aria-hidden>
            {initials(featured.name)}
          </span>
          <div>
            <strong>{featured.name}</strong>
            <span>{featured.source} traveler</span>
          </div>
          <div className="stars" aria-label="5 stars">
            ★★★★★
          </div>
        </footer>
      </blockquote>

      <div
        className="testimonials-slider"
        role="region"
        aria-roledescription="carousel"
        aria-label="Traveler reviews"
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <button
          type="button"
          className="testimonials-nav prev"
          onClick={prev}
          aria-label="Previous review"
        >
          ‹
        </button>

        <div className="testimonials-viewport">
          <div ref={trackRef} className="testimonials-track" tabIndex={-1}>
            {REVIEWS.map((r, i) => (
              <article
                key={r.name + r.text.slice(0, 12)}
                className={`testimonials-card${i === index ? ' is-active' : ''}`}
                aria-current={i === index ? 'true' : undefined}
                onClick={() => goTo(i)}
              >
                <header>
                  <span className="testimonials-avatar sm" aria-hidden>
                    {initials(r.name)}
                  </span>
                  <div>
                    <strong>{r.name}</strong>
                    <span>{r.source}</span>
                  </div>
                </header>
                <div className="stars" aria-label="5 stars">
                  ★★★★★
                </div>
                <p>{r.text}</p>
              </article>
            ))}
          </div>
        </div>

        <button
          type="button"
          className="testimonials-nav next"
          onClick={next}
          aria-label="Next review"
        >
          ›
        </button>
      </div>

      <div className="testimonials-dots" role="tablist" aria-label="Review slides">
        {REVIEWS.map((r, i) => (
          <button
            key={r.name}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-label={`Show review ${i + 1} of ${count}: ${r.name}`}
            className={i === index ? 'on' : ''}
            onClick={() => goTo(i)}
          />
        ))}
      </div>

      <div className="stats-row">
        <div>
          <b>9</b>
          <span>Vehicle classes</span>
        </div>
        <div>
          <b>3</b>
          <span>Trip modes</span>
        </div>
        <div>
          <b>
            4.8
            <small>★</small>
          </b>
          <span>Hospitality score</span>
        </div>
      </div>
    </section>
  );
}
