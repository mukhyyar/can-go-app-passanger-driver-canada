'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../lib/auth';
import { BrandLogo } from '../../components/brand-logo';
import { LiveFleetMap } from '../../components/login/LiveFleetMap';

export default function LoginPage() {
  const { login, token, ready } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('admin@can-go.local');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && token) router.replace('/');
  }, [ready, token, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await login(email, password, totpCode || undefined);
      router.replace('/');
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <section className="login-visual">
        <div className="avatar-row">
          <BrandLogo variant="lockup" size={140} className="login-lockup" />
        </div>
        <h2>See every vehicle — even before registration.</h2>
        <p className="muted" style={{ maxWidth: 520 }}>
          Pending KYC cars sit on the wall in amber. Live drivers pulse green. Same maple red and
          ride-green as the passenger app.
        </p>
        <LiveFleetMap />
        <div className="fleet-legend">
          <span><span className="chip ok">Live</span> activated</span>
          <span><span className="chip warn">Amber</span> no registration / KYC</span>
          <span><span className="chip bad">Trip</span> in progress</span>
        </div>
      </section>
      <section className="login-card">
        <form onSubmit={onSubmit}>
          <BrandLogo size={48} />
          <h1>Sign in to Ops</h1>
          <p className="muted" style={{ marginBottom: 18 }}>
            Admin, finance, KYC, drivers, and support — passenger brand, ops depth.
          </p>
          {err && <p className="err">{err}</p>}
          <label className="muted" htmlFor="email">Email</label>
          <input id="email" className="field" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          <label className="muted" htmlFor="password">Password</label>
          <input
            id="password"
            className="field"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
          <label className="muted" htmlFor="totp">Authenticator (if enabled)</label>
          <input
            id="totp"
            className="field"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            placeholder="6-digit TOTP"
          />
          <button className="cta" disabled={busy}>
            {busy ? 'Signing in…' : 'Continue'}
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>
            Encrypted session · permission-scoped roles · impersonation audit
          </p>
        </form>
      </section>
    </div>
  );
}
