import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  Body,
} from '@nestjs/common';
import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CurrentUser,
  type AuthUser,
} from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../prisma/prisma.service';

enum AppRoleDto {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
  PASSENGER_WEB = 'PASSENGER_WEB',
}

class RegisterDeviceTokenDto {
  @IsString()
  @MinLength(10)
  token!: string;

  @IsString()
  platform!: string;

  @IsEnum(AppRoleDto)
  appRole!: AppRoleDto;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('device-tokens')
  @UseGuards(JwtAuthGuard)
  register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceTokenDto) {
    return this.notifications.registerDeviceToken({
      ...dto,
      userId: user.id,
    });
  }

  private matchesAppRole(
    r: { templateKey?: string | null; dataJson?: unknown },
    appRole?: string,
  ): boolean {
    if (!appRole) return true;
    const target = appRole.toUpperCase();
    const data = (r.dataJson ?? {}) as Record<string, unknown>;
    const assignedRole = (
      (data.appRole as string) ||
      (data.targetRole as string) ||
      ''
    ).toUpperCase();
    const assignedRoles = (
      (data.targetRoles as string) || ''
    ).toUpperCase().split(',');

    if (assignedRole) {
      if (target === 'PASSENGER') {
        return assignedRole === 'PASSENGER' || assignedRole === 'PASSENGER_WEB';
      }
      return assignedRole === target;
    }
    if (assignedRoles.length > 0 && assignedRoles[0] !== '') {
      if (target === 'PASSENGER') {
        return assignedRoles.includes('PASSENGER') || assignedRoles.includes('PASSENGER_WEB');
      }
      return assignedRoles.includes(target);
    }

    const inferred = this.notifications.resolveTargetRoles({
      templateKey: r.templateKey ?? undefined,
      data: data as Record<string, string>,
    });
    if (inferred && inferred.length > 0) {
      if (target === 'PASSENGER') {
        return inferred.includes('PASSENGER') || inferred.includes('PASSENGER_WEB');
      }
      return inferred.includes(target as any);
    }

    return true;
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw?: string,
    @Query('appRole') appRole?: string,
  ) {
    const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), 100);
    const rows = await this.prisma.notificationDelivery.findMany({
      where: {
        userId: user.id,
        OR: [
          { title: { not: null } },
          { body: { not: null } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
    });

    const seen = new Set<string>();
    const items = [];
    for (const r of rows) {
      if (!this.matchesAppRole(r, appRole)) continue;

      const data = (r.dataJson ?? {}) as Record<string, unknown>;
      const eventId = data.eventId?.toString();
      const dedupeKey =
        eventId ||
        `${r.templateKey ?? ''}|${r.title ?? ''}|${r.createdAt.toISOString().slice(0, 16)}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      items.push({
        id: r.id,
        title: r.title,
        body: r.body,
        imageUrl: (data.imageUrl as string | undefined) ?? null,
        templateKey: r.templateKey,
        status: r.status,
        createdAt: r.createdAt,
        readAt: r.readAt,
        data,
      });
      if (items.length >= limit) break;
    }
    return { items };
  }

  @Get('unread-count')
  @UseGuards(JwtAuthGuard)
  async unreadCount(
    @CurrentUser() user: AuthUser,
    @Query('appRole') appRole?: string,
  ) {
    if (!appRole) {
      const count = await this.prisma.notificationDelivery.count({
        where: {
          userId: user.id,
          readAt: null,
          OR: [{ title: { not: null } }, { body: { not: null } }],
        },
      });
      return { count };
    }

    const unreadRows = await this.prisma.notificationDelivery.findMany({
      where: {
        userId: user.id,
        readAt: null,
        OR: [{ title: { not: null } }, { body: { not: null } }],
      },
      select: { templateKey: true, dataJson: true },
      take: 200,
    });
    const count = unreadRows.filter((r) => this.matchesAppRole(r, appRole)).length;
    return { count };
  }

  @Post('read-all')
  @UseGuards(JwtAuthGuard)
  async markAllRead(@CurrentUser() user: AuthUser) {
    await this.prisma.notificationDelivery.updateMany({
      where: { userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }

  @Post(':id/read')
  @UseGuards(JwtAuthGuard)
  async markRead(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    await this.prisma.notificationDelivery.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { ok: true };
  }
}
