export type OtpPurpose =
  | 'register'
  | 'login'
  | 'verify_phone'
  | 'password_reset';

export interface OtpProvider {
  readonly name: string;
  issue(
    phoneE164: string,
    purpose: OtpPurpose,
  ): Promise<{ challengeId: string; expiresAt: Date; debugCode?: string }>;
  verify(
    challengeId: string,
    code: string,
  ): Promise<{ ok: boolean; phoneE164?: string; purpose?: OtpPurpose }>;
}

export const OTP_PROVIDER = Symbol('OTP_PROVIDER');
