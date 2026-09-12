import { Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Public guest banners — no auth. */
  @Get('active')
  async active(@Query('audience') audience?: string) {
    const now = new Date();
    return this.prisma.inAppAnnouncement.findMany({
      where: {
        active: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gt: now } }],
        ...(audience
          ? { audience: { in: [audience, 'ALL', 'GUESTS'] } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }
}
