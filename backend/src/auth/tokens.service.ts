import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

export type AccessPayload = {
  sub: string;
  role: UserRole;
  sid: string;
  imp?: boolean;
  impBy?: string;
  impSid?: string;
  ro?: boolean;
};

@Injectable()
export class TokensService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTtlMs(): number {
    const ttl = this.config.get<string>('jwt.refreshTtl') ?? '30d';
    if (ttl.endsWith('d')) return parseInt(ttl, 10) * 86400000;
    if (ttl.endsWith('h')) return parseInt(ttl, 10) * 3600000;
    if (ttl.endsWith('m')) return parseInt(ttl, 10) * 60000;
    return 30 * 86400000;
  }

  async issueSession(params: {
    userId: string;
    role: UserRole;
    deviceId?: string;
    userAgent?: string;
    ip?: string;
  }) {
    const session = await this.prisma.userSession.create({
      data: {
        userId: params.userId,
        deviceId: params.deviceId,
        userAgent: params.userAgent,
        ip: params.ip,
      },
    });

    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const accessToken = await this.jwt.signAsync(
      {
        sub: params.userId,
        role: params.role,
        sid: session.id,
      } satisfies AccessPayload,
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessTtl as `${number}m` | `${number}h` | `${number}d` | number,
      },
    );

    const familyId = `${params.role}:${randomUUID()}`;
    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());

    await this.prisma.refreshToken.create({
      data: {
        userId: params.userId,
        tokenHash: this.hashToken(refreshToken),
        familyId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
      sessionId: session.id,
    };
  }

  async issueImpersonationAccess(params: {
    targetUserId: string;
    targetRole: UserRole;
    adminId: string;
    impersonationSessionId: string;
    readOnly: boolean;
    expiresAt: Date;
    userAgent?: string;
    ip?: string;
  }) {
    const session = await this.prisma.userSession.create({
      data: {
        userId: params.targetUserId,
        deviceId: `imp:${params.impersonationSessionId}`,
        userAgent: params.userAgent,
        ip: params.ip,
      },
    });

    const remainingMs = Math.max(30_000, params.expiresAt.getTime() - Date.now());
    const expiresInSec = Math.ceil(remainingMs / 1000);

    const accessToken = await this.jwt.signAsync(
      {
        sub: params.targetUserId,
        role: params.targetRole,
        sid: session.id,
        imp: true,
        impBy: params.adminId,
        impSid: params.impersonationSessionId,
        ro: params.readOnly,
      } satisfies AccessPayload,
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: expiresInSec,
      },
    );

    return {
      accessToken,
      refreshToken: null as string | null,
      tokenType: 'Bearer' as const,
      expiresIn: `${expiresInSec}s`,
      sessionId: session.id,
      impersonation: {
        enabled: true,
        by: params.adminId,
        sessionId: params.impersonationSessionId,
        readOnly: params.readOnly,
        expiresAt: params.expiresAt.toISOString(),
      },
    };
  }

  async rotateRefresh(rawRefresh: string, meta?: { userAgent?: string; ip?: string }) {
    const tokenHash = this.hashToken(rawRefresh);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (existing.revokedAt) {
      // Reuse detection — revoke entire family
      await this.prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.prisma.userSession.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected; sessions revoked');
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    if (existing.user.isSuspended) {
      throw new UnauthorizedException('Account suspended');
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });

    const session = await this.prisma.userSession.create({
      data: {
        userId: existing.userId,
        userAgent: meta?.userAgent,
        ip: meta?.ip,
      },
    });

    let sessionRole: UserRole = existing.user.role;
    if (existing.familyId.startsWith('DRIVER:')) {
      sessionRole = UserRole.DRIVER;
    } else if (existing.familyId.startsWith('PASSENGER:')) {
      sessionRole = UserRole.PASSENGER;
    } else if (existing.familyId.startsWith('ADMIN:')) {
      sessionRole = UserRole.ADMIN;
    } else if (existing.familyId.startsWith('SUPER_ADMIN:')) {
      sessionRole = UserRole.SUPER_ADMIN;
    }

    const accessTtl = this.config.get<string>('jwt.accessTtl') ?? '15m';
    const accessToken = await this.jwt.signAsync(
      {
        sub: existing.userId,
        role: sessionRole,
        sid: session.id,
      } satisfies AccessPayload,
      {
        secret: this.config.get<string>('jwt.accessSecret'),
        expiresIn: accessTtl as `${number}m` | `${number}h` | `${number}d` | number,
      },
    );

    const refreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTtlMs());
    await this.prisma.refreshToken.create({
      data: {
        userId: existing.userId,
        tokenHash: this.hashToken(refreshToken),
        familyId: existing.familyId,
        expiresAt,
      },
    });

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.config.get<string>('jwt.accessTtl') ?? '15m',
      sessionId: session.id,
    };
  }

  async revokeRefresh(rawRefresh: string) {
    const tokenHash = this.hashToken(rawRefresh);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, revokedAt: null },
    });
    if (!existing) return;
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string) {
    const now = new Date();
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}
