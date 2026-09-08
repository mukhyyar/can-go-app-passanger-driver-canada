import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { UserRole } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import type { AccessPayload } from './tokens.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.accessSecret') ?? 'change-me',
    });
  }

  async validate(payload: AccessPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: {
        adminRole: { include: { permissions: true } },
      },
    });
    if (!user || user.isSuspended || user.archivedAt) {
      throw new UnauthorizedException('Invalid or suspended user');
    }

    if (payload.sid) {
      const session = await this.prisma.userSession.findFirst({
        where: { id: payload.sid, userId: user.id, revokedAt: null },
      });
      if (!session) {
        throw new UnauthorizedException('Session revoked');
      }
      await this.prisma.userSession.update({
        where: { id: session.id },
        data: { lastSeenAt: new Date() },
      });
    }

    if (payload.imp && payload.impSid) {
      const imp = await this.prisma.impersonationSession.findUnique({
        where: { id: payload.impSid },
      });
      if (
        !imp ||
        imp.revokedAt ||
        imp.targetUserId !== user.id ||
        imp.expiresAt.getTime() < Date.now()
      ) {
        throw new UnauthorizedException('Impersonation session expired');
      }
    }

    const permissions =
      user.role === UserRole.SUPER_ADMIN
        ? ['*']
        : (user.adminRole?.permissions.map((p) => p.permission) ?? []);

    return {
      id: user.id,
      role: user.role,
      sessionId: payload.sid,
      email: user.email,
      permissions,
      impersonation: payload.imp
        ? {
            enabled: true,
            by: payload.impBy,
            sessionId: payload.impSid,
            readOnly: payload.ro === true,
          }
        : undefined,
    };
  }
}
