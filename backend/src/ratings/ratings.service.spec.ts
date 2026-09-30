import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RatingModerationStatus,
  RideStatus,
  UserRole,
} from '@prisma/client';
import { RatingsService } from './ratings.service';

describe('RatingsService', () => {
  let ratingsService: RatingsService;
  let mockPrisma: any;

  const rideId = 'ride-123';
  const passengerUserId = 'user-passenger-1';
  const passengerProfileId = 'passenger-prof-1';
  const driverUserId = 'user-driver-1';
  const driverProfileId = 'driver-prof-1';
  const adminUserId = 'user-admin-1';
  const strangerUserId = 'user-stranger-99';

  beforeEach(() => {
    mockPrisma = {
      ride: {
        findUnique: jest.fn(),
      },
      driverProfile: {
        findUnique: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      rating: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    };

    ratingsService = new RatingsService(mockPrisma);
  });

  describe('create', () => {
    it('throws NotFoundException if ride does not exist', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue(null);

      await expect(
        ratingsService.create(driverUserId, rideId, { stars: 5 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException if ride is not COMPLETED', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.IN_PROGRESS,
        passenger: { userId: passengerUserId },
        selectedOffer: null,
      });

      await expect(
        ratingsService.create(driverUserId, rideId, { stars: 5 }),
      ).rejects.toThrow('Ride must be COMPLETED to rate');
    });

    it('throws ForbiddenException if user is neither passenger nor driver', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: { driver: { userId: driverUserId } },
        assignedDriverId: driverProfileId,
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue(null);

      await expect(
        ratingsService.create(strangerUserId, rideId, { stars: 5 }),
      ).rejects.toThrow('Only ride participants can rate');
    });

    it('allows driver to rate when selectedOffer has driver', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: { driver: { userId: driverUserId } },
        assignedDriverId: driverProfileId,
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue({ id: driverProfileId });
      mockPrisma.rating.create.mockResolvedValue({
        id: 'rating-1',
        rideId,
        fromUserId: driverUserId,
        toUserId: passengerUserId,
        stars: 5,
        moderationStatus: RatingModerationStatus.VISIBLE,
      });

      const res = await ratingsService.create(driverUserId, rideId, { stars: 5 });
      expect(res.id).toBe('rating-1');
      expect(mockPrisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rideId,
            fromUserId: driverUserId,
            toUserId: passengerUserId,
            stars: 5,
            moderationStatus: RatingModerationStatus.VISIBLE,
          }),
        }),
      );
    });

    it('allows driver to rate when selectedOffer is null but assignedDriverId matches', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: null,
        assignedDriverId: driverProfileId,
      });
      // Driver profile lookup for the calling user returns their profile id
      mockPrisma.driverProfile.findUnique
        .mockResolvedValueOnce({ id: driverProfileId }) // userDriverProfile lookup
        .mockResolvedValueOnce({ userId: driverUserId }); // assignedDriverId lookup

      mockPrisma.rating.create.mockResolvedValue({
        id: 'rating-2',
        rideId,
        fromUserId: driverUserId,
        toUserId: passengerUserId,
        stars: 4,
        moderationStatus: RatingModerationStatus.PENDING_REVIEW,
      });

      const res = await ratingsService.create(driverUserId, rideId, {
        stars: 4,
        comment: 'Great passenger!',
      });
      expect(res.id).toBe('rating-2');
      expect(mockPrisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rideId,
            fromUserId: driverUserId,
            toUserId: passengerUserId,
            stars: 4,
            comment: 'Great passenger!',
            moderationStatus: RatingModerationStatus.PENDING_REVIEW,
          }),
        }),
      );
    });

    it('allows passenger to rate when selectedOffer is null but driver is assigned via assignedDriverId', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: null,
        assignedDriverId: driverProfileId,
      });
      mockPrisma.driverProfile.findUnique
        .mockResolvedValueOnce(null) // userDriverProfile lookup for passenger
        .mockResolvedValueOnce({ userId: driverUserId }); // assignedDriverId lookup for driver

      mockPrisma.rating.create.mockResolvedValue({
        id: 'rating-3',
        rideId,
        fromUserId: passengerUserId,
        toUserId: driverUserId,
        stars: 5,
        communicationStars: 5,
        driverStars: 5,
        vehicleStars: 5,
        moderationStatus: RatingModerationStatus.VISIBLE,
      });

      const res = await ratingsService.create(passengerUserId, rideId, {
        stars: 5,
        communicationStars: 5,
        driverStars: 5,
        vehicleStars: 5,
      });
      expect(res.id).toBe('rating-3');
      expect(mockPrisma.rating.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            rideId,
            fromUserId: passengerUserId,
            toUserId: driverUserId,
            stars: 5,
            communicationStars: 5,
            driverStars: 5,
            vehicleStars: 5,
            moderationStatus: RatingModerationStatus.VISIBLE,
          }),
        }),
      );
    });

    it('throws BadRequestException if passenger rating misses category stars', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: { driver: { userId: driverUserId } },
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue(null);

      await expect(
        ratingsService.create(passengerUserId, rideId, { stars: 5 }),
      ).rejects.toThrow(
        'Passenger ratings require communication, driver, and vehicle scores',
      );
    });

    it('throws BadRequestException with "already rated" if Prisma returns P2002', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: { driver: { userId: driverUserId } },
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue({ id: driverProfileId });
      const p2002Error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
        code: 'P2002',
        clientVersion: '5.x',
      });
      mockPrisma.rating.create.mockRejectedValue(p2002Error);

      await expect(
        ratingsService.create(driverUserId, rideId, { stars: 5 }),
      ).rejects.toThrow('You already rated this ride');
    });

    it('rethrows unexpected database errors instead of masking them as already rated', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        status: RideStatus.COMPLETED,
        passenger: { userId: passengerUserId },
        selectedOffer: { driver: { userId: driverUserId } },
      });
      mockPrisma.driverProfile.findUnique.mockResolvedValue({ id: driverProfileId });
      mockPrisma.rating.create.mockRejectedValue(new Error('Connection lost'));

      await expect(
        ratingsService.create(driverUserId, rideId, { stars: 5 }),
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('listForRide', () => {
    it('allows assigned driver to list ratings even if selectedOffer is null', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        passenger: { userId: passengerUserId },
        selectedOffer: null,
        assignedDriverId: driverProfileId,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: driverUserId,
        role: UserRole.DRIVER,
        driverProfile: { id: driverProfileId },
      });
      mockPrisma.rating.findMany.mockResolvedValue([
        { id: 'r1', stars: 5 },
      ]);

      const list = await ratingsService.listForRide(driverUserId, rideId);
      expect(list).toHaveLength(1);
    });

    it('allows admin to list ratings', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        passenger: { userId: passengerUserId },
        selectedOffer: null,
        assignedDriverId: driverProfileId,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: adminUserId,
        role: UserRole.ADMIN,
      });
      mockPrisma.rating.findMany.mockResolvedValue([]);

      const list = await ratingsService.listForRide(adminUserId, rideId);
      expect(list).toEqual([]);
    });

    it('throws ForbiddenException for unauthorized user', async () => {
      mockPrisma.ride.findUnique.mockResolvedValue({
        id: rideId,
        passenger: { userId: passengerUserId },
        selectedOffer: null,
        assignedDriverId: driverProfileId,
      });
      mockPrisma.user.findUnique.mockResolvedValue({
        id: strangerUserId,
        role: UserRole.PASSENGER,
        driverProfile: null,
      });

      await expect(
        ratingsService.listForRide(strangerUserId, rideId),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
