import { createHmac, createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokensService } from './tokens.service';
import type { AuthUser } from './decorators/current-user.decorator';
import { OTP_PROVIDER } from '../providers/otp/otp-provider.interface';
import type { OtpProvider } from '../providers/otp/otp-provider.interface';
import { StorageService } from '../storage/storage.service';
import {
  AdminTotpDisableDto,
  AdminTotpEnableDto,
  LoginDto,
  OAuthAppleDto,
  OAuthGoogleDto,
  OAuthLinkPhoneDto,
  OtpSendDto,
  OtpVerifyDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  RegisterDto,
} from './dto/auth.dto';
import { OAuthVerifyService, type OAuthIdentity } from './oauth-verify.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly oauthVerify: OAuthVerifyService,
    private readonly storage: StorageService,
    @Inject(OTP_PROVIDER) private readonly otp: OtpProvider,
  ) {}

  private async requireDb() {
    if (!(await this.prisma.isReady())) {
      throw new ServiceUnavailableException(
        'Database unavailable. Start Postgres (docker compose up -d) and run migrations.',
      );
    }
  }

  private assertPassengerOrDriverRole(role: UserRole) {
    if (role !== UserRole.PASSENGER && role !== UserRole.DRIVER) {
      throw new BadRequestException(
        'Public registration allows PASSENGER or DRIVER only',
      );
    }
  }

  async register(
    dto: RegisterDto,
    meta?: { userAgent?: string; ip?: string },
  ) {
    await this.requireDb();
    this.assertPassengerOrDriverRole(dto.role);

    const email = dto.email.trim().toLowerCase();
    const phoneE164 = dto.phoneE164.trim();

    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email }, { phoneE164 }] },
    });
    if (existing) {
      throw new ConflictException('Email or phone already registered');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const fullName = dto.fullName?.trim() ?? '';

    const user = await this.prisma.user.create({
      data: {
        email,
        phoneE164,
        passwordHash,
        role: dto.role,
        ...(dto.role === UserRole.PASSENGER
          ? {
              passengerProfile: {
                create: { fullName },
              },
            }
          : {
              driverProfile: {
                create: {
                  fullName,
                  approvalStatus: 'PENDING_KYC',
                  isActivated: false,
                },
              },
            }),
      },
    });

    const challenge = await this.otp.issue(phoneE164, 'verify_phone');

    await this.audit(user.id, 'auth.register', 'User', user.id, meta?.ip);

    return {
      userId: user.id,
      role: user.role,
      requiresPhoneVerification: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      ...(challenge.debugCode ? { debugCode: challenge.debugCode } : {}),
      message: 'Verify phone OTP to complete registration and receive tokens',
    };
  }

  async verifyOtp(
    dto: OtpVerifyDto,
    meta?: { userAgent?: string; ip?: string },
  ) {
    await this.requireDb();
    const result = await this.otp.verify(dto.challengeId, dto.code);
    if (!result.ok || !result.phoneE164) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    let user = await this.prisma.user.findUnique({
      where: { phoneE164: result.phoneE164 },
      include: { passengerProfile: true, driverProfile: true },
    });

    // Phone-first signup: create passenger when OTP login/register has no user yet
    if (
      !user &&
      (result.purpose === 'login' ||
        result.purpose === 'register' ||
        result.purpose === 'verify_phone')
    ) {
      user = await this.prisma.user.create({
        data: {
          phoneE164: result.phoneE164,
          phoneVerifiedAt: new Date(),
          role: UserRole.PASSENGER,
          passengerProfile: { create: { fullName: '' } },
        },
        include: { passengerProfile: true, driverProfile: true },
      });
      await this.audit(user.id, 'auth.phone_register', 'User', user.id, meta?.ip);
    }

    if (!user) {
      throw new NotFoundException('User not found for this phone');
    }
    if (user.isSuspended || user.archivedAt) {
      throw new ForbiddenException('Account suspended');
    }

    if (
      result.purpose === 'verify_phone' ||
      result.purpose === 'register' ||
      result.purpose === 'login'
    ) {
      if (!user.phoneVerifiedAt) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { phoneVerifiedAt: new Date() },
        });
        user = { ...user, phoneVerifiedAt: new Date() };
      }
    }

    const tokens = await this.tokens.issueSession({
      userId: user.id,
      role: user.role,
      deviceId: dto.deviceId,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    await this.audit(user.id, 'auth.otp_verify', 'User', user.id, meta?.ip);

    return {
      user: this.publicUser(user),
      ...tokens,
    };
  }

  async sendOtp(dto: OtpSendDto) {
    await this.requireDb();
    // Always issue for login/register so phone-first signup works.
    // password_reset still uses requestPasswordReset for anti-enumeration.
    if (dto.purpose === 'verify_phone') {
      const user = await this.prisma.user.findUnique({
        where: { phoneE164: dto.phoneE164 },
      });
      if (!user) {
        throw new NotFoundException('No account for this phone');
      }
    }

    const challenge = await this.otp.issue(dto.phoneE164, dto.purpose);
    return {
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      ...(challenge.debugCode ? { debugCode: challenge.debugCode } : {}),
    };
  }

  async login(dto: LoginDto, meta?: { userAgent?: string; ip?: string }) {
    await this.requireDb();
    if (!dto.email && !dto.phoneE164) {
      throw new BadRequestException('email or phoneE164 required');
    }

    const user = await this.prisma.user.findFirst({
      where: dto.email
        ? { email: dto.email.trim().toLowerCase() }
        : { phoneE164: dto.phoneE164!.trim() },
      include: { passengerProfile: true, driverProfile: true },
    });

    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isSuspended || user.archivedAt) {
      throw new ForbiddenException('Account suspended');
    }

    if (
      (user.role === UserRole.PASSENGER || user.role === UserRole.DRIVER) &&
      !user.phoneVerifiedAt
    ) {
      const challenge = await this.otp.issue(
        user.phoneE164!,
        'verify_phone',
      );
      throw new ForbiddenException({
        code: 'PHONE_NOT_VERIFIED',
        message: 'Phone verification required',
        challengeId: challenge.challengeId,
        expiresAt: challenge.expiresAt,
        ...(challenge.debugCode ? { debugCode: challenge.debugCode } : {}),
      });
    }

    if (
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) &&
      this.config.get<boolean>('admin.totpEnforce') === true &&
      !user.adminTotpEnabled
    ) {
      throw new UnauthorizedException({
        code: 'TOTP_SETUP_REQUIRED',
        message: 'Admin 2FA enrollment required before login',
      });
    }

    if (
      (user.role === UserRole.ADMIN || user.role === UserRole.SUPER_ADMIN) &&
      user.adminTotpEnabled
    ) {
      if (!dto.totpCode) {
        throw new UnauthorizedException({
          code: 'TOTP_REQUIRED',
          message: 'Admin 2FA code required',
        });
      }
      const valid = this.verifyTotp(user.adminTotpSecret!, dto.totpCode);
      if (!valid) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }

    const tokens = await this.tokens.issueSession({
      userId: user.id,
      role: user.role,
      deviceId: dto.deviceId,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    await this.audit(user.id, 'auth.login', 'User', user.id, meta?.ip);
    return { user: this.publicUser(user), ...tokens };
  }

  async refresh(refreshToken: string, meta?: { userAgent?: string; ip?: string }) {
    await this.requireDb();
    return this.tokens.rotateRefresh(refreshToken, meta);
  }

  async logout(userId: string | undefined, refreshToken?: string) {
    await this.requireDb();
    if (refreshToken) {
      await this.tokens.revokeRefresh(refreshToken);
    }
    if (userId) {
      await this.audit(userId, 'auth.logout', 'User', userId);
    }
    return { ok: true };
  }

  async logoutAll(userId: string) {
    await this.requireDb();
    await this.tokens.revokeAllForUser(userId);
    await this.audit(userId, 'auth.logout_all', 'User', userId);
    return { ok: true };
  }

  async me(userId: string, actor?: AuthUser) {
    await this.requireDb();
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        passengerProfile: true,
        driverProfile: true,
        adminRole: { include: { permissions: true } },
      },
    });
    if (!user) throw new NotFoundException();
    const permissions =
      user.role === UserRole.SUPER_ADMIN
        ? ['*']
        : (user.adminRole?.permissions.map((p) => p.permission) ??
          actor?.permissions ??
          []);
    const base = this.publicUser(user);
    const avatarKey =
      user.passengerProfile?.avatarStorageKey ??
      user.driverProfile?.avatarStorageKey ??
      null;
    let avatarUrl: string | null = null;
    if (avatarKey && this.storage.isReady()) {
      try {
        avatarUrl = await this.storage.getSignedGetUrl(avatarKey, 3600);
      } catch {
        avatarUrl = null;
      }
    }
    if (base.passenger) {
      (base.passenger as Record<string, unknown>).avatarUrl = avatarUrl;
      (base.passenger as Record<string, unknown>).avatarStorageKey =
        user.passengerProfile?.avatarStorageKey ?? null;
    }
    if (base.driver) {
      (base.driver as Record<string, unknown>).avatarUrl = avatarUrl;
      (base.driver as Record<string, unknown>).avatarStorageKey =
        user.driverProfile?.avatarStorageKey ?? null;
    }
    return {
      ...base,
      avatarUrl,
      permissions,
      adminRole: user.adminRole
        ? { slug: user.adminRole.slug, name: user.adminRole.name }
        : null,
      impersonation: actor?.impersonation,
    };
  }

  async uploadAvatar(
    userId: string,
    file: { buffer: Buffer; mimetype: string; originalname?: string },
  ) {
    await this.requireDb();
    if (!this.storage.isReady()) {
      throw new ServiceUnavailableException('Object storage is not available');
    }
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const normalizeMime = (m?: string | null) => {
      if (!m) return undefined;
      const lower = m.toLowerCase().trim();
      if (lower === 'image/jpg') return 'image/jpeg';
      return lower;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FileType = require('file-type') as {
      fromBuffer: (
        buf: Buffer,
      ) => Promise<{ ext: string; mime: string } | undefined>;
    };
    const detected = await FileType.fromBuffer(file.buffer);
    const mime =
      normalizeMime(detected?.mime) ?? normalizeMime(file.mimetype);
    if (!mime || !allowed.has(mime)) {
      throw new BadRequestException('Avatar must be jpeg, png, or webp');
    }
    if (file.buffer.length > 5 * 1024 * 1024) {
      throw new BadRequestException('Avatar max size is 5MB');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { passengerProfile: true, driverProfile: true },
    });
    if (!user) throw new NotFoundException();
    const ext =
      mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const key = `avatars/${userId}/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`;
    await this.storage.putObject({
      key,
      body: file.buffer,
      contentType: mime,
    });

    if (user.passengerProfile) {
      await this.prisma.passengerProfile.update({
        where: { id: user.passengerProfile.id },
        data: { avatarStorageKey: key },
      });
    } else if (user.driverProfile) {
      await this.prisma.driverProfile.update({
        where: { id: user.driverProfile.id },
        data: { avatarStorageKey: key },
      });
    } else {
      throw new BadRequestException('No profile to attach avatar');
    }

    const avatarUrl = await this.storage.getSignedGetUrl(key, 3600);
    await this.audit(userId, 'avatar.upload', 'User', userId);
    return { avatarUrl, avatarStorageKey: key };
  }

  async listSessions(userId: string) {
    await this.requireDb();
    return this.prisma.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        deviceId: true,
        userAgent: true,
        ip: true,
        lastSeenAt: true,
        createdAt: true,
      },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.requireDb();
    const session = await this.prisma.userSession.findFirst({
      where: { id: sessionId, userId },
    });
    if (!session) throw new NotFoundException('Session not found');
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await this.audit(userId, 'auth.session_revoke', 'UserSession', sessionId);
    return { ok: true };
  }

  async requestPasswordReset(dto: PasswordResetRequestDto) {
    await this.requireDb();
    const user = await this.prisma.user.findFirst({
      where: dto.email
        ? { email: dto.email.trim().toLowerCase() }
        : { phoneE164: dto.phoneE164!.trim() },
    });

    // Always generic response (no enumeration)
    if (!user?.phoneE164) {
      return { ok: true, message: 'If the account exists, an OTP was sent' };
    }

    const challenge = await this.otp.issue(user.phoneE164, 'password_reset');
    return {
      ok: true,
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      ...(challenge.debugCode ? { debugCode: challenge.debugCode } : {}),
      message: 'If the account exists, an OTP was sent',
    };
  }

  async confirmPasswordReset(dto: PasswordResetConfirmDto) {
    await this.requireDb();
    const result = await this.otp.verify(dto.challengeId, dto.code);
    if (!result.ok || result.purpose !== 'password_reset' || !result.phoneE164) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const user = await this.prisma.user.findUnique({
      where: { phoneE164: result.phoneE164 },
    });
    if (!user) throw new NotFoundException();

    const passwordHash = await this.passwords.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await this.tokens.revokeAllForUser(user.id);
    await this.audit(user.id, 'auth.password_reset', 'User', user.id);
    return { ok: true };
  }

  /** Admin 2FA-ready: stores TOTP secret; enforcement happens on login when enabled. */
  async adminTotpSetup(userId: string) {
    await this.requireDb();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    if (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN) {
      throw new ForbiddenException('Admin only');
    }

    // Simple TOTP secret (base32-ish). Production should use otplib; Phase 1a scaffolds storage.
    const secret = randomBytes(20).toString('hex');
    await this.prisma.user.update({
      where: { id: userId },
      data: { adminTotpSecret: secret, adminTotpEnabled: false },
    });

    return {
      secret,
      otpauthUrl: `otpauth://totp/CAN-RIDE:${user.email}?secret=${secret}&issuer=CAN-RIDE`,
      enabled: false,
      note: 'Call POST /auth/admin/2fa/enable with a valid code to enforce 2FA on login',
    };
  }

  async adminTotpEnable(userId: string, dto: AdminTotpEnableDto) {
    await this.requireDb();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.adminTotpSecret) {
      throw new BadRequestException('Run 2FA setup first');
    }
    if (!this.verifyTotp(user.adminTotpSecret, dto.code)) {
      throw new UnauthorizedException('Invalid 2FA code');
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { adminTotpEnabled: true },
    });
    await this.audit(userId, 'auth.admin_2fa_enable', 'User', userId);
    return { enabled: true };
  }

  async adminTotpDisable(userId: string, dto: AdminTotpDisableDto) {
    await this.requireDb();
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user?.passwordHash) throw new NotFoundException();
    const ok = await this.passwords.verify(user.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Invalid password');
    if (user.adminTotpEnabled && user.adminTotpSecret) {
      if (!this.verifyTotp(user.adminTotpSecret, dto.code)) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
    }
    await this.prisma.user.update({
      where: { id: userId },
      data: { adminTotpEnabled: false, adminTotpSecret: null },
    });
    await this.audit(userId, 'auth.admin_2fa_disable', 'User', userId);
    return { enabled: false };
  }

  /**
   * Lightweight TOTP verification (30s window, SHA1 HMAC).
   * Sufficient for 2FA-ready architecture; can swap to otplib later.
   */
  private verifyTotp(secretHex: string, code: string): boolean {
    try {
      const key = Buffer.from(secretHex, 'hex');
      const step = 30;
      const now = Math.floor(Date.now() / 1000);
      for (const w of [0, -1, 1]) {
        const counter = Math.floor(now / step) + w;
        const buf = Buffer.alloc(8);
        buf.writeBigUInt64BE(BigInt(counter));
        const hmac = createHmac('sha1', key).update(buf).digest();
        const offset = hmac[hmac.length - 1] & 0xf;
        const bin =
          ((hmac[offset] & 0x7f) << 24) |
          ((hmac[offset + 1] & 0xff) << 16) |
          ((hmac[offset + 2] & 0xff) << 8) |
          (hmac[offset + 3] & 0xff);
        const otp = String(bin % 1_000_000).padStart(6, '0');
        if (otp === code) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async consumeImpersonation(
    rawToken: string,
    meta?: { userAgent?: string; ip?: string },
  ) {
    await this.requireDb();
    if (!rawToken?.trim()) {
      throw new BadRequestException('token required');
    }
    const tokenHash = createHash('sha256').update(rawToken.trim()).digest('hex');
    const session = await this.prisma.impersonationSession.findUnique({
      where: { tokenHash },
      include: { target: true, admin: true },
    });
    if (!session || session.revokedAt) {
      throw new UnauthorizedException('Invalid impersonation token');
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Impersonation token expired');
    }
    if (session.consumedAt) {
      throw new UnauthorizedException('Impersonation token already used');
    }
    if (session.target.isSuspended || session.target.archivedAt) {
      throw new ForbiddenException('Target account is suspended');
    }

    await this.prisma.impersonationSession.update({
      where: { id: session.id },
      data: { consumedAt: new Date() },
    });

    const tokens = await this.tokens.issueImpersonationAccess({
      targetUserId: session.targetUserId,
      targetRole: session.target.role,
      adminId: session.adminId,
      impersonationSessionId: session.id,
      readOnly: session.readOnly,
      expiresAt: session.expiresAt,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    await this.audit(
      session.adminId,
      'USER_IMPERSONATE_CONSUME',
      'User',
      session.targetUserId,
      meta?.ip,
    );

    return {
      ...tokens,
      user: this.publicUser({
        ...session.target,
        passengerProfile: null,
        driverProfile: null,
      }),
    };
  }

  async endImpersonation(actor: AuthUser) {
    await this.requireDb();
    const impSid = actor.impersonation?.sessionId;
    if (!impSid) {
      throw new BadRequestException('Not an impersonation session');
    }
    await this.prisma.impersonationSession.update({
      where: { id: impSid },
      data: { revokedAt: new Date() },
    });
    if (actor.sessionId) {
      await this.prisma.userSession.update({
        where: { id: actor.sessionId },
        data: { revokedAt: new Date() },
      });
    }
    await this.audit(
      actor.impersonation?.by,
      'USER_IMPERSONATE_END',
      'User',
      actor.id,
    );
    return { ok: true, adminUrl: this.config.get<string>('admin.adminWebBase') };
  }

  oauthConfig() {
    const googleIds = this.oauthVerify.googleAudiences();
    const appleIds = this.oauthVerify.appleAudiences();
    const localMock = this.oauthVerify.localMockEnabled();
    return {
      google: {
        enabled: googleIds.length > 0 || localMock,
        clientId: googleIds[0] ?? null,
        localMock: localMock && googleIds.length === 0,
      },
      apple: {
        enabled: appleIds.length > 0 || localMock,
        clientId: appleIds[0] ?? null,
        localMock: localMock && appleIds.length === 0,
      },
    };
  }

  async oauthGoogle(
    dto: OAuthGoogleDto,
    meta?: { userAgent?: string; ip?: string },
  ) {
    await this.requireDb();
    const identity = dto.idToken
      ? await this.oauthVerify.verifyGoogleIdToken(dto.idToken)
      : this.oauthVerify.mockIdentity('google', dto.email!, dto.fullName);
    return this.completeOAuth(identity, dto.deviceId, meta, dto.role);
  }

  async oauthApple(
    dto: OAuthAppleDto,
    meta?: { userAgent?: string; ip?: string },
  ) {
    await this.requireDb();
    const identity = dto.idToken
      ? await this.oauthVerify.verifyAppleIdToken(dto.idToken)
      : this.oauthVerify.mockIdentity('apple', dto.email!, dto.fullName);
    if (dto.fullName?.trim() && !identity.fullName) {
      identity.fullName = dto.fullName.trim();
    }
    return this.completeOAuth(identity, dto.deviceId, meta, dto.role);
  }

  async linkOAuthPhone(dto: OAuthLinkPhoneDto) {
    await this.requireDb();
    const userId = await this.verifyPhoneLinkToken(dto.linkToken);
    const phoneE164 = dto.phoneE164.trim();

    const existingPhone = await this.prisma.user.findUnique({
      where: { phoneE164 },
    });
    if (existingPhone && existingPhone.id !== userId) {
      throw new ConflictException('Phone already registered to another account');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { phoneE164 },
    });

    const challenge = await this.otp.issue(phoneE164, 'verify_phone');
    return {
      challengeId: challenge.challengeId,
      expiresAt: challenge.expiresAt,
      ...(challenge.debugCode ? { debugCode: challenge.debugCode } : {}),
      message: 'Verify phone OTP to complete sign-in',
    };
  }

  private async completeOAuth(
    identity: OAuthIdentity,
    deviceId?: string,
    meta?: { userAgent?: string; ip?: string },
    requestedRole?: UserRole,
  ) {
    if (!identity.email && identity.provider === 'google') {
      throw new BadRequestException('Google account email is required');
    }

    const role =
      requestedRole === UserRole.DRIVER
        ? UserRole.DRIVER
        : UserRole.PASSENGER;

    const linked = await this.prisma.oAuthAccount.findUnique({
      where: {
        provider_providerSubject: {
          provider: identity.provider,
          providerSubject: identity.subject,
        },
      },
      include: {
        user: { include: { passengerProfile: true, driverProfile: true } },
      },
    });

    let user = linked?.user ?? null;

    if (!user && identity.email) {
      const byEmail = await this.prisma.user.findUnique({
        where: { email: identity.email },
        include: { passengerProfile: true, driverProfile: true },
      });
      if (byEmail) {
        await this.prisma.oAuthAccount.create({
          data: {
            userId: byEmail.id,
            provider: identity.provider,
            providerSubject: identity.subject,
            email: identity.email,
          },
        });
        user = byEmail;
      }
    }

    if (user && user.role !== role) {
      throw new ForbiddenException(
        user.role === UserRole.PASSENGER
          ? 'This Google account is registered as a passenger. Use the passenger app or a different Google account.'
          : 'This Google account is registered as a driver. Use the driver app or a different Google account.',
      );
    }

    if (!user) {
      const fullName = identity.fullName ?? '';
      user = await this.prisma.user.create({
        data: {
          email: identity.email,
          role,
          ...(role === UserRole.PASSENGER
            ? { passengerProfile: { create: { fullName } } }
            : {
                driverProfile: {
                  create: {
                    fullName,
                    approvalStatus: 'PENDING_KYC',
                    isActivated: false,
                  },
                },
              }),
          oauthAccounts: {
            create: {
              provider: identity.provider,
              providerSubject: identity.subject,
              email: identity.email,
            },
          },
        },
        include: { passengerProfile: true, driverProfile: true },
      });
      await this.audit(
        user.id,
        `auth.oauth_${identity.provider}_register`,
        'User',
        user.id,
        meta?.ip,
      );
    } else {
      await this.audit(
        user.id,
        `auth.oauth_${identity.provider}_login`,
        'User',
        user.id,
        meta?.ip,
      );
    }

    if (user.isSuspended || user.archivedAt) {
      throw new ForbiddenException('Account suspended');
    }

    if (
      (user.role === UserRole.PASSENGER || user.role === UserRole.DRIVER) &&
      !user.phoneVerifiedAt
    ) {
      const linkToken = await this.issuePhoneLinkToken(user.id);
      return {
        requiresPhoneLink: true as const,
        linkToken,
        user: this.publicUser(user),
        message: 'Add and verify a phone number to finish signing in',
      };
    }

    const tokens = await this.tokens.issueSession({
      userId: user.id,
      role: user.role,
      deviceId,
      userAgent: meta?.userAgent,
      ip: meta?.ip,
    });

    return {
      requiresPhoneLink: false as const,
      user: this.publicUser(user),
      ...tokens,
    };
  }

  private async issuePhoneLinkToken(userId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, purpose: 'oauth_phone_link' },
      { expiresIn: '15m' },
    );
  }

  private async verifyPhoneLinkToken(token: string): Promise<string> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        purpose?: string;
      }>(token);
      if (payload.purpose !== 'oauth_phone_link' || !payload.sub) {
        throw new UnauthorizedException('Invalid link token');
      }
      return payload.sub;
    } catch {
      throw new UnauthorizedException('Invalid or expired link token');
    }
  }

  private publicUser(user: {
    id: string;
    email: string | null;
    phoneE164: string | null;
    phoneVerifiedAt: Date | null;
    role: UserRole;
    isSuspended: boolean;
    adminTotpEnabled: boolean;
    passengerProfile?: {
      id: string;
      fullName: string;
      isVip?: boolean;
      referralCode?: string | null;
    } | null;
    driverProfile?: {
      id: string;
      fullName: string;
      approvalStatus: string;
      isActivated: boolean;
      drivingEnabled?: boolean;
    } | null;
  }) {
    return {
      id: user.id,
      email: user.email,
      phoneE164: user.phoneE164,
      phoneVerifiedAt: user.phoneVerifiedAt,
      role: user.role,
      isSuspended: user.isSuspended,
      adminTotpEnabled: user.adminTotpEnabled,
      passenger: user.passengerProfile
        ? {
            id: user.passengerProfile.id,
            fullName: user.passengerProfile.fullName,
            isVip: user.passengerProfile.isVip ?? false,
            referralCode: user.passengerProfile.referralCode ?? null,
          }
        : undefined,
      driver: user.driverProfile
        ? {
            id: user.driverProfile.id,
            fullName: user.driverProfile.fullName,
            approvalStatus: user.driverProfile.approvalStatus,
            isActivated: user.driverProfile.isActivated,
            drivingEnabled: user.driverProfile.drivingEnabled ?? false,
          }
        : undefined,
    };
  }

  private async audit(
    actorId: string | undefined,
    action: string,
    resource?: string,
    resourceId?: string,
    ip?: string,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action,
          resource,
          resourceId,
          ip,
        },
      });
    } catch {
      // non-fatal
    }
  }
}
