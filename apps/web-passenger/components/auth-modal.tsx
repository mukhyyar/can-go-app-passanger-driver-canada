'use client';

import { useState, type FormEvent } from 'react';
import { useAuth } from './auth-provider';

type Step = 'methods' | 'email' | 'register' | 'phone' | 'otp';

export function AuthModal({
  open,
  onClose,
  onAuthed,
}: {
  open: boolean;
  onClose: () => void;
  onAuthed?: () => void;
}) {
  const auth = useAuth();
  const [step, setStep] = useState<Step>('methods');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('+1');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [debugHint, setDebugHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  function reset() {
    setStep('methods');
    setError(null);
    setOtp('');
    setChallengeId(null);
    setDebugHint(null);
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onEmailLogin(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      await auth.login(email, password);
      onAuthed?.();
      reset();
      onClose();
    });
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await auth.register({
        email,
        password,
        phoneE164: phone,
        fullName: name || undefined,
      });
      setChallengeId(res.challengeId);
      setDebugHint(res.debugCode ?? null);
      setStep('otp');
    });
  }

  async function onPhone(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await auth.sendPhoneOtp(phone);
      if (!res.challengeId) {
        setError('No account for this number. Continue with email to register.');
        return;
      }
      setChallengeId(res.challengeId);
      setDebugHint(res.debugCode ?? null);
      setStep('otp');
    });
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    await run(async () => {
      await auth.verifyOtp(challengeId, otp);
      onAuthed?.();
      reset();
      onClose();
    });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="auth-title">
            {step === 'methods' && 'Log in or sign up'}
            {step === 'email' && 'Continue with email'}
            {step === 'register' && 'Create account'}
            {step === 'phone' && 'Continue with phone'}
            {step === 'otp' && 'Verify phone'}
          </h2>
          <button
            className="icon-btn"
            type="button"
            aria-label="Close"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            ×
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {step === 'methods' && (
          <>
            <button
              className="auth-btn"
              type="button"
              onClick={() =>
                setError('Google sign-in is coming soon. Use email or phone.')
              }
            >
              <GoogleMark />
              Continue with Google
            </button>
            <button
              className="auth-btn"
              type="button"
              onClick={() =>
                setError('Apple sign-in is coming soon. Use email or phone.')
              }
            >
              <span className="ab-icon">
                <AppleMark />
              </span>
              Continue with Apple
            </button>
            <div style={{ height: 8 }} />
            <button className="auth-btn" type="button" onClick={() => setStep('email')}>
              <span className="ab-icon">@</span>
              Continue with email
            </button>
            <button className="auth-btn" type="button" onClick={() => setStep('phone')}>
              <span className="ab-icon">
                <PhoneMark />
              </span>
              Continue with phone
            </button>
            <p className="legal">
              By registering, you agree to the{' '}
              <a href="/privacy">CAN-GO Privacy Policy</a>, as well as the{' '}
              <a href="/terms">CAN-GO Service Agreement</a>.
            </p>
          </>
        )}

        {step === 'email' && (
          <form className="form-grid" onSubmit={onEmailLogin}>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Sign in
            </button>
            <button className="linkish" type="button" onClick={() => setStep('register')}>
              Need an account? Register
            </button>
          </form>
        )}

        {step === 'register' && (
          <form className="form-grid" onSubmit={onRegister}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              required
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone +14165551234"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (8+ characters)"
              type="password"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Create account
            </button>
          </form>
        )}

        {step === 'phone' && (
          <form className="form-grid" onSubmit={onPhone}>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone +14165551234"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Send code
            </button>
          </form>
        )}

        {step === 'otp' && (
          <form className="form-grid" onSubmit={onVerify}>
            {debugHint && <p className="muted">Dev code: {debugHint}</p>}
            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              placeholder="OTP code"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Verify
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="ab-icon" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.4S8.9 6.6 12 6.6c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 4.2 14.6 3.2 12 3.2 7.4 3.2 3.6 7 3.6 12s3.8 8.8 8.4 8.8c4.8 0 8-3.4 8-8.2 0-.5 0-.9-.1-1.2H12z" />
    </svg>
  );
}

function AppleMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <path
        fill="#111"
        d="M16.4 12.6c0-2.1 1.7-3.1 1.8-3.2-1-1.4-2.5-1.6-3-1.6-1.3-.1-2.5.8-3.1.8-.7 0-1.7-.7-2.8-.7-2.2 0-4.2 1.8-4.2 5.2 0 1.6.6 3.3 1.6 4.4.8.9 1.5 1.8 2.6 1.8 1 0 1.4-.6 2.7-.6 1.3 0 1.6.6 2.7.6 1.1 0 1.8-.9 2.5-1.8.8-1.1 1.1-2.1 1.1-2.2-.1 0-2.1-.8-2.1-3.1zM14.7 6.4c.6-.7 1-1.7.9-2.7-.9 0-1.9.6-2.5 1.3-.6.7-1 1.6-.9 2.6 1 .1 1.9-.5 2.5-1.2z"
      />
    </svg>
  );
}

function PhoneMark() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="2.5" stroke="#111" fill="none" strokeWidth="1.7" />
      <circle cx="12" cy="17.5" r="0.9" fill="#111" />
    </svg>
  );
}
