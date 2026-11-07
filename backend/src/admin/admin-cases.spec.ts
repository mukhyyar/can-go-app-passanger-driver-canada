jest.mock('@nestjs/config', () => ({
  ConfigService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
  })),
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: jest.fn().mockImplementation(() => ({
    sign: jest.fn(),
    verify: jest.fn(),
  })),
}));

import { AdminOpsService } from './admin.service';
import { SupportCaseStatus, SupportCaseType, UserRole } from '@prisma/client';

describe('AdminOpsService - Support Case Management & Assignment', () => {
  let service: AdminOpsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      supportCase: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      supportCaseNote: {
        create: jest.fn().mockResolvedValue({ id: 'note-1' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    const mockConfig = { get: jest.fn() } as any;
    const mockNotifications = {} as any;
    const mockLaunchGate = {} as any;
    const mockFirebase = {} as any;
    const mockPasswords = {} as any;
    const mockTokens = {} as any;
    const mockStorage = { isReady: jest.fn().mockReturnValue(false) } as any;
    const mockPayments = {} as any;
    const mockSms = {} as any;

    service = new AdminOpsService(
      prisma,
      mockConfig,
      mockNotifications,
      mockLaunchGate,
      mockFirebase,
      mockPasswords,
      mockTokens,
      mockStorage,
      mockPayments,
      mockSms,
    );
  });

  describe('listCases', () => {
    it('filters unassigned cases when queue=unassigned and includes contact relations', async () => {
      await service.listCases({ queue: 'unassigned' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assigneeId: null },
          include: expect.objectContaining({
            assignee: expect.any(Object),
            passenger: expect.objectContaining({
              select: expect.objectContaining({
                user: expect.objectContaining({
                  select: { id: true, email: true, phoneE164: true },
                }),
              }),
            }),
            driver: expect.objectContaining({
              select: expect.objectContaining({
                user: expect.objectContaining({
                  select: { id: true, email: true, phoneE164: true },
                }),
              }),
            }),
            ride: expect.any(Object),
            payment: expect.any(Object),
            notes: expect.any(Object),
          }),
        }),
      );
    });

    it('filters assigned to admin when queue=assigned and adminId is given', async () => {
      await service.listCases({ queue: 'assigned', adminId: 'admin-123' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { assigneeId: 'admin-123' },
        }),
      );
    });

    it('filters open cases when queue=open', async () => {
      await service.listCases({ queue: 'open' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: {
              in: [
                SupportCaseStatus.OPEN,
                SupportCaseStatus.PENDING,
                SupportCaseStatus.UNDER_REVIEW,
                SupportCaseStatus.ASSIGNED,
                SupportCaseStatus.ESCALATED,
                SupportCaseStatus.LEGAL_ISSUE,
              ],
            },
          },
        }),
      );
    });

    it('filters escalated cases when queue=escalated', async () => {
      await service.listCases({ queue: 'escalated' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: SupportCaseStatus.ESCALATED },
        }),
      );
    });
  });

  describe('listCaseAssignees', () => {
    it('returns active admin and super admin users', async () => {
      prisma.user.findMany.mockResolvedValue([
        { id: 'admin-1', email: 'support@can-rides.ca', role: UserRole.ADMIN },
        { id: 'admin-2', email: 'lead@can-rides.ca', role: UserRole.SUPER_ADMIN },
      ]);

      const result = await service.listCaseAssignees();
      expect(result).toHaveLength(2);
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { role: { in: [UserRole.ADMIN, UserRole.SUPER_ADMIN] }, isSuspended: false },
        select: {
          id: true,
          email: true,
          role: true,
        },
        orderBy: { email: 'asc' },
      });
    });
  });

  describe('getCase', () => {
    it('returns a single case with all relations', async () => {
      prisma.supportCase.findUnique.mockResolvedValue({
        id: 'case-1',
        title: 'Ride dispute',
        status: SupportCaseStatus.OPEN,
        assignee: null,
        passenger: { id: 'pax-1', fullName: 'John Doe', userId: 'user-1' },
        driver: { id: 'drv-1', fullName: 'Jane Smith', userId: 'user-2' },
        ride: { id: 'ride-1', fromLabel: 'Point A', toLabel: 'Point B', status: 'COMPLETED' },
        payment: { id: 'pay-1', amount: 25.5, currency: 'CAD', status: 'SUCCEEDED' },
        notes: [],
      });

      const res = await service.getCase('case-1');
      expect(res.id).toBe('case-1');
      expect(res.ride.id).toBe('ride-1');
    });

    it('throws NotFoundException if case does not exist', async () => {
      prisma.supportCase.findUnique.mockResolvedValue(null);
      await expect(service.getCase('missing')).rejects.toThrow('Case not found');
    });
  });

  describe('updateCase - assignment and status transitions', () => {
    it('auto-transitions OPEN to ASSIGNED when assigning to an admin', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.OPEN,
          assigneeId: null,
        })
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.ASSIGNED,
          assigneeId: 'admin-1',
          assignee: { id: 'admin-1', email: 'agent@can-rides.ca', role: UserRole.ADMIN },
          notes: [],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-1',
        status: SupportCaseStatus.ASSIGNED,
        assigneeId: 'admin-1',
      });

      const res = await service.updateCase('admin-curr', 'case-1', {
        assigneeId: 'admin-1',
      });

      expect(prisma.supportCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-1' },
          data: {
            status: SupportCaseStatus.ASSIGNED,
            assigneeId: 'admin-1',
          },
        }),
      );
      expect(res?.status).toBe(SupportCaseStatus.ASSIGNED);
    });

    it('auto-transitions ASSIGNED to OPEN when unassigning (assigneeId: null)', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.ASSIGNED,
          assigneeId: 'admin-1',
        })
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.OPEN,
          assigneeId: null,
          assignee: null,
          notes: [],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-1',
        status: SupportCaseStatus.OPEN,
        assigneeId: null,
      });

      const res = await service.updateCase('admin-curr', 'case-1', {
        assigneeId: null,
      });

      expect(prisma.supportCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-1' },
          data: {
            status: SupportCaseStatus.OPEN,
            assigneeId: null,
          },
        }),
      );
      expect(res?.status).toBe(SupportCaseStatus.OPEN);
    });

    it('preserves explicitly provided status even if assigneeId is modified', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.OPEN,
          assigneeId: null,
        })
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.ESCALATED,
          assigneeId: 'admin-1',
          notes: [],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-1',
        status: SupportCaseStatus.ESCALATED,
        assigneeId: 'admin-1',
      });

      await service.updateCase('admin-curr', 'case-1', {
        assigneeId: 'admin-1',
        status: SupportCaseStatus.ESCALATED,
      });

      expect(prisma.supportCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: {
            status: SupportCaseStatus.ESCALATED,
            assigneeId: 'admin-1',
          },
        }),
      );
    });

    it('creates a note when note text is included in update', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.OPEN,
          assigneeId: null,
        })
        .mockResolvedValueOnce({
          id: 'case-1',
          status: SupportCaseStatus.ASSIGNED,
          assigneeId: 'admin-1',
          notes: [{ id: 'note-1', body: 'Reassigning to tier 2' }],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-1',
        status: SupportCaseStatus.ASSIGNED,
        assigneeId: 'admin-1',
      });

      await service.updateCase('admin-curr', 'case-1', {
        assigneeId: 'admin-1',
        note: 'Reassigning to tier 2',
      });

      expect(prisma.supportCaseNote.create).toHaveBeenCalledWith({
        data: {
          caseId: 'case-1',
          authorId: 'admin-curr',
          body: 'Reassigning to tier 2',
        },
      });
    });
  });
});

