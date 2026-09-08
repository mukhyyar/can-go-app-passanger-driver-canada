'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';

export type OtpInputStatus = 'idle' | 'error' | 'success';

const OTP_LENGTH = 6;

export function maskPhoneE164(phone?: string | null): string {
  const raw = (phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return 'your phone';
  const last4 = digits.slice(-4);
  let country = '+';
  if (raw.startsWith('+') && digits.length > 10) {
    country = `+${digits.slice(0, digits.length - 10)}`;
  } else if (raw.startsWith('+')) {
    country = `+${digits.slice(0, Math.min(3, Math.max(1, digits.length - 4)))}`;
  }
  return `${country} ••• ••• ${last4}`;
}

export function friendlyOtpError(err: unknown): string {
  const raw =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  if (
    raw.includes('network') ||
    raw.includes('fetch') ||
    raw.includes('failed to fetch') ||
    raw.includes('timeout')
  ) {
    return "We couldn't verify the code. Check your connection and try again.";
  }
  if (raw.includes('too many') || raw.includes('throttl') || raw.includes('429')) {
    return 'Too many attempts. Please wait before trying again.';
  }
  if (raw.includes('expired')) {
    return 'This verification code has expired. Request a new code to continue.';
  }
  return "That code doesn't look right. Check the code and try again.";
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  status = 'idle',
  autoFocus = true,
  length = OTP_LENGTH,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  status?: OtpInputStatus;
  autoFocus?: boolean;
  length?: number;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const [shake, setShake] = useState(false);
  const digits = value.replace(/\D/g, '').slice(0, length).split('');

  useEffect(() => {
    if (status === 'error') {
      setShake(true);
      const t = window.setTimeout(() => setShake(false), 420);
      return () => window.clearTimeout(t);
    }
  }, [status]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      refs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  const setDigit = useCallback(
    (index: number, char: string) => {
      if (disabled || status === 'success') return;
      const next = Array.from({ length }, (_, i) => digits[i] ?? '');
      next[index] = char;
      const joined = next.join('').slice(0, length);
      onChange(joined);
      if (joined.length === length) onComplete?.(joined);
    },
    [digits, disabled, length, onChange, onComplete, status],
  );

  const handleChange = (index: number, raw: string) => {
    const only = raw.replace(/\D/g, '');
    if (!only) {
      setDigit(index, '');
      return;
    }
    if (only.length > 1) {
      // Paste into a cell
      const next = value.replace(/\D/g, '').split('');
      for (let i = 0; i < only.length && index + i < length; i++) {
        next[index + i] = only[i]!;
      }
      const joined = next.join('').slice(0, length);
      onChange(joined);
      const focusAt = Math.min(index + only.length, length - 1);
      refs.current[focusAt]?.focus();
      if (joined.length === length) onComplete?.(joined);
      return;
    }
    setDigit(index, only);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (digits[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        setDigit(index - 1, '');
        refs.current[index - 1]?.focus();
      }
      return;
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      e.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    const focusAt = Math.min(pasted.length, length - 1);
    refs.current[focusAt]?.focus();
    if (pasted.length === length) onComplete?.(pasted);
  };

  return (
    <div
      className={`otp-cells${shake ? ' otp-cells--shake' : ''}${
        status === 'error' ? ' otp-cells--error' : ''
      }${status === 'success' ? ' otp-cells--success' : ''}`}
      role="group"
      aria-label={`${length}-digit verification code`}
    >
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={`otp-cell${digits[i] ? ' otp-cell--filled' : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${i + 1} of ${length}`}
          maxLength={length}
          value={digits[i] ?? ''}
          disabled={disabled || status === 'success'}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

export function formatResendCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
