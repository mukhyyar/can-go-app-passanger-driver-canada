'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { promptAppleIdToken, promptGoogleIdToken } from '../lib/oauth-client';
import { useAuth } from './auth-provider';
import {
  OtpInput,
  friendlyOtpError,
  formatResendCountdown,
  maskPhoneE164,
  type OtpInputStatus,
} from './otp-input';

type Step =
  | 'methods'
  | 'email'
  | 'register'
  | 'phone'
  | 'otp'
  | 'oauth-local'
  | 'oauth-phone';

type OAuthProvider = 'google' | 'apple';
type OtpOrigin = 'phone' | 'register' | 'oauth-phone' | 'email';
type OtpPurpose = 'login' | 'verify_phone';

const RESEND_SECONDS = 30;

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
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [oauthProvider, setOauthProvider] = useState<OAuthProvider>('google');
  const [otpOrigin, setOtpOrigin] = useState<OtpOrigin>('phone');
  const [otpPurpose, setOtpPurpose] = useState<OtpPurpose>('login');
  const [error, setError] = useState<string | null>(null);
  const [otpStatus, setOtpStatus] = useState<OtpInputStatus>('idle');
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(RESEND_SECONDS);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);
  const [verifiedFlash, setVerifiedFlash] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== 'otp' || resendLeft <= 0) return;
    const t = window.setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(t);
  }, [step, resendLeft]);

  function reset() {
    setStep('methods');
    setError(null);
    setOtp('');
    setChallengeId(null);
    setDebugHint(null);
    setLinkToken(null);
    setOtpStatus('idle');
    setOtpMessage(null);
    setResendNotice(null);
    setVerifiedFlash(false);
    setResendLeft(RESEND_SECONDS);
  }

  function finishAuthed() {
    onAuthed?.();
    reset();
    onClose();
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

  function enterOtp(opts: {
    challengeId: string;
    debugCode?: string | null;
    origin: OtpOrigin;
    purpose: OtpPurpose;
  }) {
    setChallengeId(opts.challengeId);
    setDebugHint(opts.debugCode ?? null);
    setOtpOrigin(opts.origin);
    setOtpPurpose(opts.purpose);
    setOtp('');
    setOtpStatus('idle');
    setOtpMessage(null);
    setResendNotice(null);
    setVerifiedFlash(false);
    setResendLeft(RESEND_SECONDS);
    setError(null);
    setStep('otp');
  }

  async function handleOAuthResult(result: Awaited<ReturnType<typeof auth.oauthGoogle>>) {
    if (result.requiresPhoneLink) {
      setLinkToken(result.linkToken);
      setStep('oauth-phone');
      return;
    }
    finishAuthed();
  }

  async function onGoogle() {
    await run(async () => {
      const cfg = auth.oauthConfig?.google;
      if (!cfg?.enabled) {
        throw new Error('Google sign-in is not available right now.');
      }
      if (cfg.localMock || !cfg.clientId) {
        setOauthProvider('google');
        setStep('oauth-local');
        return;
      }
      const idToken = await promptGoogleIdToken(cfg.clientId);
      const result = await auth.oauthGoogle({ idToken });
      await handleOAuthResult(result);
    });
  }

  async function onApple() {
    await run(async () => {
      const cfg = auth.oauthConfig?.apple;
      if (!cfg?.enabled) {
        throw new Error('Apple sign-in is not available right now.');
      }
      if (cfg.localMock || !cfg.clientId) {
        setOauthProvider('apple');
        setStep('oauth-local');
        return;
      }
      const apple = await promptAppleIdToken(cfg.clientId);
      const result = await auth.oauthApple({
        idToken: apple.idToken,
        fullName: apple.fullName,
        email: apple.email,
      });
      await handleOAuthResult(result);
    });
  }

  async function onOAuthLocal(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const input = { email, fullName: name || undefined };
      const result =
        oauthProvider === 'google'
          ? await auth.oauthGoogle(input)
          : await auth.oauthApple(input);
      await handleOAuthResult(result);
    });
  }

  async function onEmailLogin(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      try {
        await auth.login(email, password);
        finishAuthed();
      } catch (err) {
        if (err instanceof ApiError && err.code === 'PHONE_NOT_VERIFIED') {
          const cid = err.body.challengeId;
          if (typeof cid === 'string') {
            enterOtp({
              challengeId: cid,
              debugCode:
                typeof err.body.debugCode === 'string' ? err.body.debugCode : null,
              origin: 'email',
              purpose: 'verify_phone',
            });
            return;
          }
        }
        throw err;
      }
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
      enterOtp({
        challengeId: res.challengeId,
        debugCode: res.debugCode ?? null,
        origin: 'register',
        purpose: 'verify_phone',
      });
    });
  }

  async function onPhone(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const res = await auth.sendPhoneOtp(phone, 'login');
      if (!res.challengeId) {
        setError('Could not send a code. Check the number and try again.');
        return;
      }
      enterOtp({
        challengeId: res.challengeId,
        debugCode: res.debugCode ?? null,
        origin: 'phone',
        purpose: 'login',
      });
    });
  }

  async function onOAuthPhone(e: FormEvent) {
    e.preventDefault();
    if (!linkToken) return;
    await run(async () => {
      const res = await auth.linkOAuthPhone(linkToken, phone);
      enterOtp({
        challengeId: res.challengeId,
        debugCode: res.debugCode ?? null,
        origin: 'oauth-phone',
        purpose: 'verify_phone',
      });
    });
  }

  async function onVerify(code?: string) {
    const nextCode = (code ?? otp).replace(/\D/g, '');
    if (!challengeId || nextCode.length !== 6 || busy || verifiedFlash) return;
    setBusy(true);
    setError(null);
    setOtpMessage(null);
    setOtpStatus('idle');
    try {
      await auth.verifyOtp(challengeId, nextCode);
      setOtpStatus('success');
      setVerifiedFlash(true);
      setOtpMessage('Phone verified successfully');
      finishAuthed();
    } catch (e) {
      setOtpStatus('error');
      setOtpMessage(friendlyOtpError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    if (resendBusy || resendLeft > 0 || busy) return;
    setResendBusy(true);
    setResendNotice(null);
    setOtpMessage(null);
    setOtpStatus('idle');
    try {
      let res: { challengeId?: string; debugCode?: string };
      if (otpOrigin === 'oauth-phone') {
        if (!linkToken) throw new Error('Session expired. Go back and try again.');
        res = await auth.linkOAuthPhone(linkToken, phone);
      } else {
        res = await auth.sendPhoneOtp(phone, otpPurpose);
      }
      if (!res.challengeId) {
        throw new Error('Could not send a new code.');
      }
      setChallengeId(res.challengeId);
      setDebugHint(res.debugCode ?? null);
      setOtp('');
      setResendLeft(RESEND_SECONDS);
      setResendNotice('A new verification code has been sent.');
    } catch (e) {
      setOtpMessage(friendlyOtpError(e));
      setOtpStatus('error');
    } finally {
      setResendBusy(false);
    }
  }

  function onChangeNumber() {
    setOtp('');
    setChallengeId(null);
    setDebugHint(null);
    setOtpStatus('idle');
    setOtpMessage(null);
    setResendNotice(null);
    setVerifiedFlash(false);
    setError(null);
    if (otpOrigin === 'register') setStep('register');
    else if (otpOrigin === 'oauth-phone') setStep('oauth-phone');
    else if (otpOrigin === 'email') setStep('email');
    else setStep('phone');
  }

  if (!open) return null;

  const title =
    step === 'methods'
      ? 'Log in or sign up'
      : step === 'email'
        ? 'Continue with email'
        : step === 'register'
          ? 'Create account'
          : step === 'phone'
            ? 'Continue with phone'
            : step === 'oauth-local'
              ? oauthProvider === 'google'
                ? 'Continue with Google'
                : 'Continue with Apple'
              : step === 'oauth-phone'
                ? 'Add your phone'
                : 'Verify your phone';

  const otpComplete = otp.replace(/\D/g, '').length === 6;

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className={`modal${step === 'otp' ? ' modal--otp' : ''}`}
        role="dialog"
        aria-labelledby="auth-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          {step === 'otp' ? (
            <button
              className="icon-btn"
              type="button"
              aria-label="Back"
              onClick={onChangeNumber}
            >
              ←
            </button>
          ) : (
            <h2 id="auth-title">{title}</h2>
          )}
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

        {error && step !== 'otp' && <div className="error-banner">{error}</div>}

        {step === 'methods' && (
          <>
            <button
              className="auth-btn"
              type="button"
              disabled={busy}
              onClick={() => void onGoogle()}
            >
              <GoogleMark />
              Continue with Google
            </button>
            <button
              className="auth-btn"
              type="button"
              disabled={busy}
              onClick={() => void onApple()}
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
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                CAN-RIDE Privacy Policy
              </a>
              , as well as the{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                CAN-RIDE Service Agreement
              </a>
              .
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
              autoComplete="email"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              type="password"
              autoComplete="current-password"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Sign in
            </button>
            <button className="linkish" type="button" onClick={() => setStep('register')}>
              Need an account? Register
            </button>
            <button className="linkish" type="button" onClick={() => setStep('methods')}>
              Back
            </button>
          </form>
        )}

        {step === 'register' && (
          <form className="form-grid" onSubmit={onRegister}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              required
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone +14165551234"
              autoComplete="tel"
              required
            />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password (8+ characters)"
              type="password"
              autoComplete="new-password"
              required
            />
            <p className="legal">
              By creating an account, you agree to the{' '}
              <a href="/privacy" target="_blank" rel="noopener noreferrer">
                Privacy Policy
              </a>{' '}
              and{' '}
              <a href="/terms" target="_blank" rel="noopener noreferrer">
                Service Agreement
              </a>
              .
            </p>
            <button className="cta" disabled={busy} type="submit">
              Create account
            </button>
            <button className="linkish" type="button" onClick={() => setStep('email')}>
              Back
            </button>
          </form>
        )}

        {step === 'phone' && (
          <form className="form-grid" onSubmit={onPhone}>
            <p className="muted">We&apos;ll text a code to sign in or create your account.</p>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone +14165551234"
              autoComplete="tel"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Send code
            </button>
            <button className="linkish" type="button" onClick={() => setStep('methods')}>
              Back
            </button>
          </form>
        )}

        {step === 'oauth-local' && (
          <form className="form-grid" onSubmit={onOAuthLocal}>
            <p className="muted">
              Local/dev {oauthProvider === 'google' ? 'Google' : 'Apple'} sign-in. Set{' '}
              {oauthProvider === 'google' ? 'GOOGLE_OAUTH_CLIENT_ID' : 'APPLE_CLIENT_ID'} for
              production.
            </p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              autoComplete="name"
            />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              type="email"
              autoComplete="email"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Continue
            </button>
            <button className="linkish" type="button" onClick={() => setStep('methods')}>
              Back
            </button>
          </form>
        )}

        {step === 'oauth-phone' && (
          <form className="form-grid" onSubmit={onOAuthPhone}>
            <p className="muted">Passengers need a verified phone number to book rides.</p>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone +14165551234"
              autoComplete="tel"
              required
            />
            <button className="cta" disabled={busy} type="submit">
              Send code
            </button>
            <button className="linkish" type="button" onClick={() => setStep('methods')}>
              Back
            </button>
          </form>
        )}

        {step === 'otp' && (
          <div className="otp-panel">
            <div className="otp-illus" aria-hidden>
              <PhoneVerifyMark />
            </div>
            <h2 id="auth-title" className="otp-title">
              Verify your phone
            </h2>
            <p className="otp-lede">Enter the 6-digit code sent to</p>
            <div className="otp-phone-row">
              <span className="otp-phone">{maskPhoneE164(phone)}</span>
              <button className="otp-change" type="button" onClick={onChangeNumber}>
                Change
              </button>
            </div>

            {debugHint && (
              <div className="otp-dev" role="note">
                <span className="otp-dev-label">Development mode</span>
                <span className="otp-dev-code">Test OTP: {debugHint}</span>
              </div>
            )}

            <OtpInput
              value={otp}
              onChange={(v) => {
                setOtp(v);
                if (otpStatus === 'error') {
                  setOtpStatus('idle');
                  setOtpMessage(null);
                }
              }}
              onComplete={(code) => void onVerify(code)}
              disabled={busy || verifiedFlash}
              status={otpStatus}
            />

            {otpMessage && (
              <p
                className={`otp-feedback${
                  otpStatus === 'error'
                    ? ' otp-feedback--error'
                    : otpStatus === 'success'
                      ? ' otp-feedback--ok'
                      : ''
                }`}
                role={otpStatus === 'error' ? 'alert' : 'status'}
              >
                {otpStatus === 'success' ? '✓ ' : ''}
                {otpMessage}
              </p>
            )}

            {resendNotice && !otpMessage && (
              <p className="otp-feedback otp-feedback--ok" role="status">
                ✓ {resendNotice}
              </p>
            )}

            <div className="otp-resend">
              <p className="otp-resend-q">Didn&apos;t receive a code?</p>
              {resendLeft > 0 ? (
                <p className="otp-resend-timer">
                  Resend code in {formatResendCountdown(resendLeft)}
                </p>
              ) : (
                <button
                  type="button"
                  className="otp-resend-btn"
                  disabled={resendBusy || busy}
                  onClick={() => void onResend()}
                >
                  {resendBusy ? 'Sending…' : 'Resend code'}
                </button>
              )}
            </div>

            <button
              className="cta otp-cta"
              type="button"
              disabled={!otpComplete || busy || verifiedFlash}
              onClick={() => void onVerify()}
            >
              {busy ? (
                <span className="otp-cta-loading">
                  <span className="otp-spinner" aria-hidden />
                  Verifying…
                </span>
              ) : verifiedFlash ? (
                '✓ Phone verified'
              ) : (
                'Verify & Continue'
              )}
            </button>

            <p className="otp-secure">
              <LockMark />
              Secure verification · Your information is protected
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="ab-icon" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.6h5.1c-.2 1.2-1.5 3.6-5.1 3.6-3.1 0-5.6-2.5-5.6-5.4S8.9 6.6 12 6.6c1.8 0 3 .7 3.7 1.4l2.5-2.4C16.7 4.2 14.6 3.2 12 3.2 7.4 3.2 3.6 7 3.6 12s3.8 8.8 8.4 8.8c4.8 0 8-3.4 8-8.2 0-.5 0-.9-.1-1.2H12z"
      />
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
      <rect
        x="7"
        y="3"
        width="10"
        height="18"
        rx="2.5"
        stroke="#111"
        fill="none"
        strokeWidth="1.7"
      />
      <circle cx="12" cy="17.5" r="0.9" fill="#111" />
    </svg>
  );
}

function PhoneVerifyMark() {
  return (
    <svg viewBox="0 0 64 64" width="56" height="56" aria-hidden>
      <circle cx="32" cy="32" r="32" fill="#fdeaea" />
      <rect
        x="22"
        y="12"
        width="20"
        height="36"
        rx="4"
        fill="#fff"
        stroke="#e50000"
        strokeWidth="2"
      />
      <circle cx="32" cy="42" r="1.6" fill="#e50000" />
      <circle cx="44" cy="44" r="10" fill="#1b7a45" />
      <path
        d="M39.5 44.2l2.6 2.6 5.4-5.4"
        fill="none"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LockMark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
      <rect
        x="3"
        y="7"
        width="10"
        height="7"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M5 7V5.2a3 3 0 016 0V7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
