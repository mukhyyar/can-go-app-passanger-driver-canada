'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import type { Ride } from '../../lib/types';
import { AuthModal } from '../../components/auth-modal';
import { SiteFooter } from '../../components/site-footer';
import { SiteHeader } from '../../components/site-header';
import { useAuth } from '../../components/auth-provider';

export default function RidesPage() {
  const { token, me, ready } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [rides, setRides] = useState<Ride[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!token) {
      setAuthOpen(true);
      return;
    }
    api<Ride[]>('/rides', { token })
      .then((list) => setRides(Array.isArray(list) ? list : []))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [ready, token]);

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
        <div className="card-list">
          {rides.map((r) => (
            <article key={r.id} className="ride-card">
              <strong>{r.status}</strong>
              <p>
                {r.fromLabel} → {r.toLabel ?? '—'}
              </p>
            </article>
          ))}
          {token && rides.length === 0 && !error && (
            <p className="muted">No trips yet. Request offers from the home page.</p>
          )}
        </div>
        <p>
          <Link href="/">← Back to CAN-GO</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
