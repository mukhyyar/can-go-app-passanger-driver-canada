import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export async function writeAudit(
  prisma: PrismaService,
  input: {
    actorId?: string | null;
    action: string;
    resource?: string;
    resourceId?: string;
    meta?: Record<string, unknown>;
    before?: unknown;
    after?: unknown;
    reason?: string;
    device?: string;
    ip?: string;
  },
) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? undefined,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        meta: (input.meta ?? {}) as Prisma.InputJsonValue,
        before: input.before === undefined ? undefined : (input.before as Prisma.InputJsonValue),
        after: input.after === undefined ? undefined : (input.after as Prisma.InputJsonValue),
        reason: input.reason,
        device: input.device,
        ip: input.ip,
      },
    });
  } catch {
    /* non-fatal */
  }
}

export function asNum(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  if (v && typeof v === 'object' && 'toNumber' in v) {
    try {
      return (v as { toNumber: () => number }).toNumber();
    } catch {
      return 0;
    }
  }
  return 0;
}

export function snapField(snap: unknown, key: string): number {
  if (!snap || typeof snap !== 'object') return 0;
  return asNum((snap as Record<string, unknown>)[key]);
}

export function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function rangeStart(range: string, from?: string, to?: string): { start: Date; end: Date } {
  const end = to ? new Date(to) : new Date();
  if (from) return { start: new Date(from), end };
  const start = new Date(end);
  switch (range) {
    case 'today':
      return { start: startOfUtcDay(end), end };
    case '7d':
      start.setUTCDate(start.getUTCDate() - 7);
      return { start, end };
    case '90d':
      start.setUTCDate(start.getUTCDate() - 90);
      return { start, end };
    case '12m':
      start.setUTCFullYear(start.getUTCFullYear() - 1);
      return { start, end };
    case '30d':
    default:
      start.setUTCDate(start.getUTCDate() - 30);
      return { start, end };
  }
}

export function ridePublicCode(id: string) {
  return `CG-RIDE-${id.slice(-5).toUpperCase()}`;
}
