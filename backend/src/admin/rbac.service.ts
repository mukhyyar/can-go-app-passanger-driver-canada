import { Injectable, OnModuleInit } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS, ROLE_SEEDS, type Permission } from '../auth/permissions';

@Injectable()
export class AdminRbacService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    if (!(await this.prisma.isReady())) return;
    await this.ensureRoles();
    await this.ensureFlagsAndTemplates();
  }

  async ensureRoles() {
    for (const seed of ROLE_SEEDS) {
      const role = await this.prisma.adminRole.upsert({
        where: { slug: seed.slug },
        create: {
          slug: seed.slug,
          name: seed.name,
          description: seed.description,
          isSystem: true,
        },
        update: { name: seed.name, description: seed.description },
      });
      const existing = await this.prisma.adminRolePermission.findMany({
        where: { roleId: role.id },
      });
      const have = new Set(existing.map((e) => e.permission));
      const want = new Set(seed.permissions);
      for (const p of seed.permissions) {
        if (!have.has(p)) {
          await this.prisma.adminRolePermission.createMany({
            data: [{ roleId: role.id, permission: p }],
            skipDuplicates: true,
          });
        }
      }
      for (const row of existing) {
        if (!want.has(row.permission as Permission)) {
          await this.prisma.adminRolePermission.delete({ where: { id: row.id } });
        }
      }
    }

    const superRole = await this.prisma.adminRole.findUnique({
      where: { slug: 'super-admin' },
    });
    if (superRole) {
      await this.prisma.user.updateMany({
        where: {
          role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] },
          adminRoleId: null,
        },
        data: { adminRoleId: superRole.id, role: UserRole.SUPER_ADMIN },
      });
    }
  }

  async ensureFlagsAndTemplates() {
    const flags = [
      { key: 'vip_enabled', enabled: true, description: 'VIP passenger perks' },
      { key: 'referrals_enabled', enabled: true, description: 'Referral credits' },
      { key: 'experiences_enabled', enabled: true, description: 'Experiences catalog' },
      { key: 'analytics_demo', enabled: false, description: 'Allow labeled demo analytics when requested' },
    ];
    for (const f of flags) {
      await this.prisma.featureFlag.upsert({
        where: { key: f.key },
        create: f,
        update: {},
      });
    }
    const templates = [
      {
        key: 'ride_booked',
        channel: 'push',
        title: 'Ride booked',
        body: 'Your CAN-RIDE transfer is confirmed.',
      },
      {
        key: 'driver_en_route',
        channel: 'push',
        title: 'Driver on the way',
        body: 'Your driver is en route to pickup.',
      },
      {
        key: 'promo_blast',
        channel: 'push',
        title: 'CAN-RIDE offer',
        body: 'A new promo is available in the app.',
      },
    ];
    for (const t of templates) {
      await this.prisma.notificationTemplate.upsert({
        where: { key: t.key },
        create: t,
        update: {},
      });
    }
  }

  catalog() {
    return { permissions: PERMISSIONS, roles: ROLE_SEEDS.map((r) => r.slug) };
  }

  listRoles() {
    return this.prisma.adminRole.findMany({
      include: { permissions: true, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async setRolePermissions(roleId: string, permissions: string[]) {
    const role = await this.prisma.adminRole.findUnique({ where: { id: roleId } });
    if (!role) throw new Error('Role not found');
    await this.prisma.adminRolePermission.deleteMany({ where: { roleId } });
    if (permissions.length) {
      await this.prisma.adminRolePermission.createMany({
        data: permissions.map((permission) => ({ roleId, permission })),
      });
    }
    return this.prisma.adminRole.findUnique({
      where: { id: roleId },
      include: { permissions: true },
    });
  }

  async assignUserRole(userId: string, adminRoleId: string | null) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { adminRoleId },
      select: {
        id: true,
        email: true,
        role: true,
        adminRole: { select: { slug: true, name: true } },
      },
    });
  }

  listAdminUsers() {
    return this.prisma.user.findMany({
      where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] } },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        role: true,
        isSuspended: true,
        adminTotpEnabled: true,
        adminRole: { select: { id: true, slug: true, name: true } },
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
