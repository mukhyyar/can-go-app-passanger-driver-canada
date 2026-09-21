import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CMS_KINDS, CMS_SEEDS, type CmsKind } from './cms.defaults';

const PLACEHOLDER_RE = /phase 2 placeholder|placeholder\)|support@can-go\.local/i;

@Injectable()
export class CmsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const d of CMS_SEEDS) {
      const existing = await this.prisma.cmsPage.findUnique({
        where: { slug: d.slug },
      });
      if (!existing) {
        await this.prisma.cmsPage.create({
          data: {
            slug: d.slug,
            title: d.title,
            bodyMd: d.bodyMd,
            kind: d.kind,
            category: d.category,
            sortOrder: d.sortOrder,
            published: true,
          },
        });
        continue;
      }
      const stale =
        PLACEHOLDER_RE.test(existing.bodyMd) || existing.bodyMd.trim().length < 80;
      await this.prisma.cmsPage.update({
        where: { slug: d.slug },
        data: {
          kind: d.kind,
          category: d.category ?? existing.category,
          sortOrder: existing.sortOrder || d.sortOrder,
          ...(stale
            ? { title: d.title, bodyMd: d.bodyMd, published: true }
            : {}),
        },
      });
    }
  }

  listPublic(kind?: string) {
    const allowed = kind && CMS_KINDS.includes(kind as CmsKind) ? kind : undefined;
    return this.prisma.cmsPage.findMany({
      where: {
        published: true,
        ...(allowed ? { kind: allowed } : {}),
      },
      select: {
        slug: true,
        title: true,
        bodyMd: true,
        kind: true,
        category: true,
        sortOrder: true,
        updatedAt: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    });
  }

  async getPublic(slug: string) {
    const page = await this.prisma.cmsPage.findFirst({
      where: { slug, published: true },
    });
    if (!page) throw new NotFoundException('Page not found');
    return page;
  }

  listAdmin(kind?: string) {
    return this.prisma.cmsPage.findMany({
      where: kind ? { kind } : {},
      orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { slug: 'asc' }],
    });
  }

  async adminUpsert(
    adminId: string,
    data: {
      slug: string;
      title: string;
      bodyMd: string;
      published?: boolean;
      kind?: CmsKind;
      category?: string | null;
      sortOrder?: number;
    },
  ) {
    const slug = data.slug.trim().toLowerCase();
    const page = await this.prisma.cmsPage.upsert({
      where: { slug },
      create: {
        slug,
        title: data.title,
        bodyMd: data.bodyMd,
        published: data.published ?? true,
        kind: data.kind ?? 'page',
        category: data.category || null,
        sortOrder: data.sortOrder ?? 0,
      },
      update: {
        title: data.title,
        bodyMd: data.bodyMd,
        published: data.published ?? true,
        kind: data.kind ?? 'page',
        category: data.category === undefined ? undefined : data.category || null,
        sortOrder: data.sortOrder ?? 0,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'cms.upsert',
        resource: 'CmsPage',
        resourceId: page.id,
        reason: `Edited ${page.kind} /${page.slug}`,
        after: { slug: page.slug, title: page.title, published: page.published } as Prisma.InputJsonValue,
        meta: { slug: page.slug, kind: page.kind } as Prisma.InputJsonValue,
      },
    });
    return page;
  }

  async adminDelete(adminId: string, slug: string) {
    const page = await this.prisma.cmsPage.findUnique({ where: { slug } });
    if (!page) throw new NotFoundException('Page not found');
    await this.prisma.cmsPage.delete({ where: { slug } });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'cms.delete',
        resource: 'CmsPage',
        resourceId: page.id,
        reason: `Deleted /${page.slug}`,
        before: { slug: page.slug, title: page.title } as Prisma.InputJsonValue,
        meta: { slug: page.slug } as Prisma.InputJsonValue,
      },
    });
    return { ok: true, slug };
  }
}

@Injectable()
export class PromoService {
  constructor(private readonly prisma: PrismaService) {}

  async validate(code: string | undefined, currency: string) {
    if (!code?.trim()) return null;
    const normalized = code.trim().toUpperCase();
    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalized },
    });
    if (!promo || !promo.active) {
      throw new BadRequestException('Invalid promo code');
    }
    const now = Date.now();
    if (promo.startsAt && promo.startsAt.getTime() > now) {
      throw new BadRequestException('Promo not started');
    }
    if (promo.endsAt && promo.endsAt.getTime() < now) {
      throw new BadRequestException('Promo expired');
    }
    if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
      throw new BadRequestException('Promo fully redeemed');
    }
    if (promo.currency !== currency) {
      throw new BadRequestException('Promo currency mismatch');
    }
    return promo;
  }

  async incrementUse(id: string) {
    await this.prisma.promoCode.update({
      where: { id },
      data: { usedCount: { increment: 1 } },
    });
  }

  async adminCreate(
    adminId: string,
    data: {
      code: string;
      percentOff?: number;
      amountOff?: number;
      currency?: string;
      maxUses?: number;
      endsAt?: string;
    },
  ) {
    if (!data.percentOff && !data.amountOff) {
      throw new BadRequestException('percentOff or amountOff required');
    }
    const promo = await this.prisma.promoCode.create({
      data: {
        code: data.code.trim().toUpperCase(),
        percentOff: data.percentOff,
        amountOff: data.amountOff,
        currency: data.currency ?? 'CAD',
        maxUses: data.maxUses,
        endsAt: data.endsAt ? new Date(data.endsAt) : undefined,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: 'promo.create',
        resource: 'PromoCode',
        resourceId: promo.id,
      },
    });
    return promo;
  }

  list() {
    return this.prisma.promoCode.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
