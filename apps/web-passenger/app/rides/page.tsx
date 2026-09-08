'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import {
  friendlyRideStatus,
  type Ride,
} from '../../lib/types';
import { AuthModal } from '../../components/auth-modal';
import { SiteFooter } from '../../components/site-footer';
import { SiteHeader } from '../../components/site-header';
import { useAuth } from '../../components/auth-provider';

export default function RidesPage() {
  const { token, me, ready } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  async function load() {
    if (!token) return;
    const list = await api<Ride[]>('/rides', { token });
    setRides(Array.isArray(list) ? list : []);
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
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token]);

  const { upcoming, past } = useMemo(() => {
    const up: Ride[] = [];
    const pa: Ride[] = [];
    for (const r of rides) {
      const s = (r.status ?? '').toUpperCase();
      if (
        s === 'COMPLETED' ||
        s.includes('CANCEL') ||
        s === 'EXPIRED' ||
        s === 'NO_SHOW' ||
        s === 'PAYMENT_FAILED'
      ) {
        pa.push(r);
      } else {
        up.push(r);
      }
    }
    return { upcoming: up, past: pa };
  }, [rides]);

  const shown = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="page-wrap">
      <SiteHeader onLogin={() => setAuthOpen(true)} />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <main className="info-page">
        <h1>My trips</h1>
        <p className="muted">
          {me?.fullName || me?.email
            ? `Signed in as ${me.fullName || me.email}`
            : 'Sign in to see marketplace requests and incoming driver bids.'}
        </p>
        {error && <div className="error-banner">{error}</div>}
        {!token && (
          <p>
            <button className="cta" type="button" onClick={() => setAuthOpen(true)}>
              Log in or sign up
            </button>
          </p>
        )}

        {token && (
          <div style={{ display: 'flex', gap: 8, margin: '16px 0' }}>
            <button
              type="button"
              className={tab === 'upcoming' ? 'cta' : 'linkish'}
              onClick={() => setTab('upcoming')}
            >
              Upcoming ({upcoming.length})
            </button>
            <button
              type="button"
              className={tab === 'past' ? 'cta' : 'linkish'}
              onClick={() => setTab('past')}
            >
              Past ({past.length})
            </button>
          </div>
        )}

        <div className="card-list">
          {shown.map((r) => {
            const offerCount = r.offerCount ?? r.offers?.length ?? 0;
            return (
              <Link
                key={r.id}
                href={`/rides/${r.id}`}
                className="ride-card"
                style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <strong>
                    {r.shortId ? `Ride #${r.shortId}` : r.id.slice(0, 8)}
                  </strong>
                  {offerCount > 0 && (
                    <span
                      style={{
                        background: '#c62828',
                        color: '#fff',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {offerCount}
                    </span>
                  )}
                </div>
                <p style={{ margin: '8px 0 4px', color: '#c62828', fontWeight: 600 }}>
                  {friendlyRideStatus(r.status)}
                </p>
                <p>
                  {r.fromLabel} → {r.toLabel ?? '—'}
                </p>
                {r.pickupAt && (
                  <p className="muted" style={{ marginTop: 4 }}>
                    Pickup {new Date(r.pickupAt).toLocaleString()}
                  </p>
                )}
                {r.currency && (
                  <p className="muted" style={{ marginTop: 2 }}>
                    Currency {r.currency}
                    {r.priceSnapshot?.distanceKm != null
                      ? ` · ${r.priceSnapshot.distanceKm} km`
                      : ''}
                  </p>
                )}
              </Link>
            );
          })}
          {token && shown.length === 0 && !error && (
            <p className="muted">
              {tab === 'upcoming'
                ? 'No upcoming trips. Request offers from Book.'
                : 'No past trips yet.'}
            </p>
          )}
        </div>
        <p>
          <Link href="/book">← Book a transfer</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
