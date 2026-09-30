jest.mock('@nestjs/config', () => ({
  ConfigService: class MockConfigService {
    get = jest.fn();
  },
}));
jest.mock('@nestjs/jwt', () => ({
  JwtService: class MockJwtService {
    sign = jest.fn();
    verify = jest.fn();
  },
}));

import 'reflect-metadata';
import { validate } from 'class-validator';
import { SupportCaseStatus, SupportCaseType } from '@prisma/client';
import { ReportRideDto } from './dto/marketplace.dto';
import { MarketplaceService } from './marketplace.service';

describe('Ride Report Functionality', () => {
  describe('ReportRideDto Validation', () => {
    it('validates a valid ReportRideDto with reasons and details', async () => {
      const dto = new ReportRideDto();
      dto.reasons = ['Dangerous / Reckless driving', 'Distracted driving / Phone use'];
      dto.details = 'Driver was speeding and looking at phone.';

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('fails validation when reasons array is empty', async () => {
      const dto = new ReportRideDto();
      dto.reasons = [];

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reasons');
    });

    it('fails validation when reasons is missing', async () => {
      const dto = new ReportRideDto();

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('reasons');
    });
  });

  describe('MarketplaceService.reportRide', () => {
    let service: MarketplaceService;
    let mockPrisma: any;
    let mockNotifications: any;

    beforeEach(() => {
      mockPrisma = {
        ride: {
          findUnique: jest.fn(),
          findFirst: jest.fn(),
        },
        driverProfile: {
          findUnique: jest.fn(),
        },
        supportCase: {
          create: jest.fn(),
          update: jest.fn().mockResolvedValue({}),
        },
        chatThread: {
          upsert: jest.fn().mockResolvedValue({ id: 'thread-1', rideId: 'ride-1' }),
        },
        chatMessage: {
          create: jest.fn().mockResolvedValue({ id: 'msg-1', threadId: 'thread-1' }),
        },
        rideEvent: {
          create: jest.fn(),
        },
        auditLog: {
          create: jest.fn(),
        },
      };

      mockNotifications = {
        notifyRideStatus: jest.fn(),
        notifyAdmins: jest.fn().mockResolvedValue([]),
      };

      service = new MarketplaceService(
        mockPrisma,
        {} as any,
        {} as any,
        mockNotifications,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );
    });

    it('throws NotFoundException if ride does not exist', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue(null);

      await expect(
        service.reportRide('user-1', 'ride-not-found', {
          reasons: ['Unprofessional'],
        }),
      ).rejects.toThrow('Ride not found');
    });

    it('throws ForbiddenException if user is neither passenger nor driver', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        passengerId: 'pax-prof-1',
        passenger: { id: 'pax-prof-1', userId: 'passenger-user-1' },
        assignedDriverId: 'driver-prof-1',
        selectedOffer: {
          driver: { id: 'driver-prof-1', userId: 'driver-user-1' },
        },
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue(null);

      await expect(
        service.reportRide('random-user', 'ride-1', {
          reasons: ['Unprofessional'],
        }),
      ).rejects.toThrow('Only ride participants can report a ride');
    });

    it('allows passenger to report ride with safety concern and creates SAFETY support case', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-1',
        status: 'COMPLETED',
        passengerId: 'pax-prof-1',
        passenger: { id: 'pax-prof-1', userId: 'passenger-user-1' },
        assignedDriverId: 'driver-prof-1',
        selectedOffer: {
          driver: { id: 'driver-prof-1', userId: 'driver-user-1' },
        },
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue(null);
      mockPrisma.supportCase.create.mockResolvedValue({
        id: 'case-report-1',
        title: 'Ride report (PASSENGER): Reckless / Speeding',
        type: SupportCaseType.SAFETY,
        status: SupportCaseStatus.OPEN,
      });

      const res = await service.reportRide(
        'passenger-user-1',
        'ride-1',
        {
          reasons: ['Reckless / Speeding', 'Distracted driving'],
          details: 'Driver was running red lights.',
        },
        '127.0.0.1',
      );

      expect(res.ok).toBe(true);
      expect(res.caseId).toBe('case-report-1');
      expect(res.type).toBe(SupportCaseType.SAFETY);
      expect(mockPrisma.supportCase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Ride report (PASSENGER): Reckless / Speeding',
            type: SupportCaseType.SAFETY,
            createdById: 'passenger-user-1',
            rideId: 'ride-1',
          }),
        }),
      );
      expect(mockPrisma.rideEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorType: 'passenger',
            payload: expect.objectContaining({
              action: 'ride_reported',
              role: 'PASSENGER',
            }),
          }),
        }),
      );
      expect(res.chatThreadId).toBe('thread-1');
      expect(mockPrisma.chatThread.upsert).toHaveBeenCalledWith({
        where: { rideId: 'ride-1' },
        create: { rideId: 'ride-1' },
        update: {},
      });
      expect(mockNotifications.notifyAdmins).toHaveBeenCalledWith(
        expect.objectContaining({
          title: expect.stringContaining('Reckless / Speeding'),
          body: expect.stringContaining('PASSENGER'),
          templateKey: 'admin.ride_report',
        }),
      );
    });

    it('allows driver to report passenger with vehicle mess dispute', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: 'ride-2',
        status: 'COMPLETED',
        passengerId: 'pax-prof-1',
        passenger: { id: 'pax-prof-1', userId: 'passenger-user-1' },
        assignedDriverId: 'driver-prof-1',
        selectedOffer: {
          driver: { id: 'driver-prof-1', userId: 'driver-user-1' },
        },
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue({
        id: 'driver-prof-1',
      });
      mockPrisma.supportCase.create.mockResolvedValue({
        id: 'case-report-2',
        title: 'Ride report (DRIVER): Mess or spill in vehicle',
        type: SupportCaseType.DISPUTE,
        status: SupportCaseStatus.OPEN,
      });

      const res = await service.reportRide(
        'driver-user-1',
        'ride-2',
        {
          reasons: ['Mess or spill in vehicle'],
          details: 'Passenger spilled beverage on back seat.',
        },
        '127.0.0.1',
      );

      expect(res.ok).toBe(true);
      expect(res.caseId).toBe('case-report-2');
      expect(res.type).toBe(SupportCaseType.DISPUTE);
      expect(mockPrisma.supportCase.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            title: 'Ride report (DRIVER): Mess or spill in vehicle',
            type: SupportCaseType.DISPUTE,
            createdById: 'driver-user-1',
            rideId: 'ride-2',
          }),
        }),
      );
      expect(mockPrisma.rideEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            actorType: 'driver',
            payload: expect.objectContaining({
              action: 'ride_reported',
              role: 'DRIVER',
            }),
          }),
        }),
      );
    });
  });
});
