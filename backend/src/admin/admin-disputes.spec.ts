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
import { SupportCaseStatus, SupportCaseType } from '@prisma/client';

describe('AdminOpsService - Dispute Situation Management', () => {
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

  describe('listCases with dispute type and situation queues', () => {
    it('filters by type=DISPUTE when type is provided', async () => {
      await service.listCases({ type: SupportCaseType.DISPUTE });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ type: SupportCaseType.DISPUTE }),
        }),
      );
    });

    it('filters pending disputes when queue=pending', async () => {
      await service.listCases({ type: SupportCaseType.DISPUTE, queue: 'pending' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: SupportCaseType.DISPUTE,
            status: SupportCaseStatus.PENDING,
          },
        }),
      );
    });

    it('filters under review disputes when queue=under_review', async () => {
      await service.listCases({ type: SupportCaseType.DISPUTE, queue: 'under_review' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: SupportCaseType.DISPUTE,
            status: SupportCaseStatus.UNDER_REVIEW,
          },
        }),
      );
    });

    it('filters legal hold disputes when queue=legal', async () => {
      await service.listCases({ type: SupportCaseType.DISPUTE, queue: 'legal' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: SupportCaseType.DISPUTE,
            status: SupportCaseStatus.LEGAL_ISSUE,
          },
        }),
      );
    });

    it('filters resolved and dismissed disputes when queue=resolved', async () => {
      await service.listCases({ type: SupportCaseType.DISPUTE, queue: 'resolved' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: SupportCaseType.DISPUTE,
            status: { in: [SupportCaseStatus.RESOLVED, SupportCaseStatus.DISMISSED] },
          },
        }),
      );
    });

    it('returns all disputes without status filter when queue=all', async () => {
      await service.listCases({ type: SupportCaseType.DISPUTE, queue: 'all' });
      expect(prisma.supportCase.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: SupportCaseType.DISPUTE,
          },
        }),
      );
    });
  });

  describe('updateCase - transition dispute situations', () => {
    it('updates dispute status to LEGAL_ISSUE with note', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-disp-1',
          status: SupportCaseStatus.OPEN,
          type: SupportCaseType.DISPUTE,
        })
        .mockResolvedValueOnce({
          id: 'case-disp-1',
          status: SupportCaseStatus.LEGAL_ISSUE,
          type: SupportCaseType.DISPUTE,
          notes: [{ id: 'n-1', body: 'Passenger filed police complaint' }],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-disp-1',
        status: SupportCaseStatus.LEGAL_ISSUE,
      });

      const updated = await service.updateCase('admin-1', 'case-disp-1', {
        status: SupportCaseStatus.LEGAL_ISSUE,
        note: 'Passenger filed police complaint',
      });

      expect(prisma.supportCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'case-disp-1' },
          data: expect.objectContaining({ status: SupportCaseStatus.LEGAL_ISSUE }),
        }),
      );
      expect(prisma.supportCaseNote.create).toHaveBeenCalledWith({
        data: {
          caseId: 'case-disp-1',
          authorId: 'admin-1',
          body: 'Passenger filed police complaint',
        },
      });
      expect(updated?.status).toBe(SupportCaseStatus.LEGAL_ISSUE);
    });

    it('updates dispute status to PENDING with waiting reason', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-disp-2',
          status: SupportCaseStatus.OPEN,
        })
        .mockResolvedValueOnce({
          id: 'case-disp-2',
          status: SupportCaseStatus.PENDING,
          notes: [{ id: 'n-2', body: 'Waiting for driver dashcam footage' }],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-disp-2',
        status: SupportCaseStatus.PENDING,
      });

      const updated = await service.updateCase('admin-1', 'case-disp-2', {
        status: SupportCaseStatus.PENDING,
        note: 'Waiting for driver dashcam footage',
      });

      expect(updated?.status).toBe(SupportCaseStatus.PENDING);
    });

    it('updates dispute status to RESOLVED', async () => {
      prisma.supportCase.findUnique
        .mockResolvedValueOnce({
          id: 'case-disp-3',
          status: SupportCaseStatus.UNDER_REVIEW,
        })
        .mockResolvedValueOnce({
          id: 'case-disp-3',
          status: SupportCaseStatus.RESOLVED,
          notes: [{ id: 'n-3', body: 'Partial refund issued and driver warned' }],
        });

      prisma.supportCase.update.mockResolvedValue({
        id: 'case-disp-3',
        status: SupportCaseStatus.RESOLVED,
      });

      const updated = await service.updateCase('admin-1', 'case-disp-3', {
        status: SupportCaseStatus.RESOLVED,
        note: 'Partial refund issued and driver warned',
      });

      expect(updated?.status).toBe(SupportCaseStatus.RESOLVED);
    });
  });
});

