import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export type OAuthIdentity = {
  provider: 'google' | 'apple';
  subject: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string | null;
};

const googleJwks = createRemoteJWKSet(
  new URL('https://www.googleapis.com/oauth2/v3/certs'),
);
const appleJwks = createRemoteJWKSet(
  new URL('https://appleid.apple.com/auth/keys'),
);

@Injectable()
export class OAuthVerifyService {
  constructor(private readonly config: ConfigService) {}

  localMockEnabled(): boolean {
    return this.config.get<boolean>('oauth.localMock') === true;
  }

  googleAudiences(): string[] {
    return this.config.get<string[]>('oauth.googleClientIds') ?? [];
  }

  appleAudiences(): string[] {
    return this.config.get<string[]>('oauth.appleClientIds') ?? [];
  }

  async verifyGoogleIdToken(idToken: string): Promise<OAuthIdentity> {
    const audiences = this.googleAudiences();
    if (!audiences.length) {
      throw new ServiceUnavailableException(
        'Google sign-in is not configured (GOOGLE_OAUTH_CLIENT_ID)',
      );
    }
    try {
      const { payload } = await jwtVerify(idToken, googleJwks, {
        issuer: ['https://accounts.google.com', 'accounts.google.com'],
        audience: audiences,
      });
      const email =
        typeof payload.email === 'string'
          ? payload.email.trim().toLowerCase()
          : null;
      const emailVerified =
        payload.email_verified === true || payload.email_verified === 'true';
      const name =
        typeof payload.name === 'string' ? payload.name.trim() : null;
      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid Google token');
      }
      return {
        provider: 'google',
        subject: payload.sub,
        email,
        emailVerified,
        fullName: name,
      };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new UnauthorizedException('Invalid Google ID token');
    }
  }

  async verifyAppleIdToken(idToken: string): Promise<OAuthIdentity> {
    const audiences = this.appleAudiences();
    if (!audiences.length) {
      throw new ServiceUnavailableException(
        'Apple sign-in is not configured (APPLE_CLIENT_ID)',
      );
    }
    try {
      const { payload } = await jwtVerify(idToken, appleJwks, {
        issuer: 'https://appleid.apple.com',
        audience: audiences,
      });
      const email =
        typeof payload.email === 'string'
          ? payload.email.trim().toLowerCase()
          : null;
      const emailVerified =
        payload.email_verified === true ||
        payload.email_verified === 'true' ||
        // Apple may omit email_verified when email is present in the token
        (email != null && payload.email_verified == null);
      if (!payload.sub || typeof payload.sub !== 'string') {
        throw new UnauthorizedException('Invalid Apple token');
      }
      return {
        provider: 'apple',
        subject: payload.sub,
        email,
        emailVerified,
        fullName: null,
      };
    } catch (e) {
      if (e instanceof ServiceUnavailableException) throw e;
      throw new UnauthorizedException('Invalid Apple identity token');
    }
  }

  mockIdentity(
    provider: 'google' | 'apple',
    email: string,
    fullName?: string,
  ): OAuthIdentity {
    if (!this.localMockEnabled()) {
      throw new ServiceUnavailableException(
        `${provider} sign-in requires a real ID token`,
      );
    }
    const normalized = email.trim().toLowerCase();
    return {
      provider,
      subject: `local-${provider}-${normalized}`,
      email: normalized,
      emailVerified: true,
      fullName: fullName?.trim() || null,
    };
  }
}
