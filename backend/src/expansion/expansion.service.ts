import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ExpansionService {
  constructor(private readonly prisma: PrismaService) {}

  private code() {
    return randomBytes(4).toString('hex').toUpperCase();
  }

  async ensurePassengerReferralCode(userId: string) {
    const p = await this.prisma.passengerProfile.findUnique({
      where: { userId },
    });
    if (!p) throw new NotFoundException('Passenger profile required');
    if (p.referralCode) return p;
    return this.prisma.passengerProfile.update({
      where: { id: p.id },
      data: { referralCode: `CG${this.code()}` },
    });
  }

  async requestVip(userId: string) {
    const p = await this.prisma.passengerProfile.findUnique({
      where: { userId },
    });
    if (!p) throw new NotFoundException('Passenger profile required');
    if (p.isVip) return { isVip: true, status: 'ACTIVE' };
    const updated = await this.prisma.passengerProfile.update({
      where: { id: p.id },
      data: { vipRequestedAt: new Date() },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'vip.request',
        resource: 'PassengerProfile',
        resourceId: p.id,
      },
    });
    return {
      isVip: false,
      status: 'PENDING',
      vipRequestedAt: updated.vipRequestedAt,
    };
  }

  async vipStatus(userId: string) {
    const p = await this.prisma.passengerProfile.findUnique({
      where: { userId },
    });
    if (!p) throw new NotFoundException('Passenger profile required');
    return {
      isVip: p.isVip,
      status: p.isVip ? 'ACTIVE' : p.vipRequestedAt ? 'PENDING' : 'NONE',
      vipRequestedAt: p.vipRequestedAt,
      referralCode: p.referralCode,
    };
  }

  async adminSetVip(adminId: string, passengerProfileId: string, isVip: boolean) {
    const updated = await this.prisma.passengerProfile.update({
      where: { id: passengerProfileId },
      data: { isVip, vipRequestedAt: isVip ? null : undefined },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: adminId,
        action: isVip ? 'vip.approve' : 'vip.revoke',
        resource: 'PassengerProfile',
        resourceId: passengerProfileId,
      },
    });
    return updated;
  }

  async redeemReferral(userId: string, code: string, role: 'PASSENGER' | 'DRIVER') {
    const normalized = code.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('Referral code required');

    const existing = await this.prisma.referralRedemption.findUnique({
      where: { refereeId: userId },
    });
    if (existing) throw new ConflictException('Referral already redeemed');

    const referrerPassenger = await this.prisma.passengerProfile.findFirst({
      where: { referralCode: normalized },
    });
    if (!referrerPassenger) {
      throw new BadRequestException('Invalid referral code');
    }
    if (referrerPassenger.userId === userId) {
      throw new BadRequestException('Cannot redeem your own code');
    }

    const credit = 10;
    const row = await this.prisma.referralRedemption.create({
      data: {
        code: normalized,
        referrerId: referrerPassenger.userId,
        refereeId: userId,
        role,
        creditAmount: credit,
        currency: 'USD',
      },
    });

    if (role === 'DRIVER') {
      await this.prisma.driverProfile.updateMany({
        where: { userId },
        data: { referredByCode: normalized },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'referral.redeem',
        resource: 'ReferralRedemption',
        resourceId: row.id,
        meta: { code: normalized, credit } as Prisma.InputJsonValue,
      },
    });
    return row;
  }

  async listDayOffs(userId: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!driver) throw new NotFoundException('Driver profile required');
    return this.prisma.driverDayOff.findMany({
      where: { driverId: driver.id },
      orderBy: { date: 'asc' },
    });
  }

  async addDayOff(userId: string, dateIso: string, note?: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!driver) throw new NotFoundException('Driver profile required');
    const date = new Date(`${dateIso.slice(0, 10)}T00:00:00.000Z`);
    try {
      return await this.prisma.driverDayOff.create({
        data: { driverId: driver.id, date, note },
      });
    } catch {
      throw new ConflictException('Day off already set for this date');
    }
  }

  async removeDayOff(userId: string, id: string) {
    const driver = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!driver) throw new NotFoundException('Driver profile required');
    const row = await this.prisma.driverDayOff.findFirst({
      where: { id, driverId: driver.id },
    });
    if (!row) throw new NotFoundException('Day off not found');
    await this.prisma.driverDayOff.delete({ where: { id } });
    return { ok: true };
  }

  listCatalog(serviceType?: string) {
    return this.prisma.catalogItem.findMany({
      where: {
        active: true,
        ...(serviceType ? { serviceType } : {}),
      },
      orderBy: { title: 'asc' },
    });
  }
}
