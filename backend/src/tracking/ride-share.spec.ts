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

import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RideStatus, UserRole } from '@prisma/client';
import { TrackingService } from './tracking.service';

describe('Ride Share Live Tracking Feature', () => {
  let service: TrackingService;
  let prismaMock: any;
  let storeMock: any;
  let gatewayMock: any;

  const mockPassengerUserId = 'passenger-user-123';
  const mockOtherUserId = 'other-user-999';
  const mockRideId = 'ride-abc-123';
  const mockShareToken = 'mock-share-token-a1b2c3d4';

  beforeEach(() => {
    prismaMock = {
      ride: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
      rating: {
        findMany: jest.fn().mockResolvedValue([{ stars: 5 }, { stars: 4 }]),
      },
      driverLocationCurrent: {
        findUnique: jest.fn().mockResolvedValue({
          driverId: 'drv-profile-1',
          lat: 43.6532,
          lng: -79.3832,
          heading: 90,
          speedMps: 12.5,
          accuracyM: 5,
          recordedAt: new Date(),
        }),
      },
      tripLocationSample: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
      $executeRawUnsafe: jest.fn(),
    };

    storeMock = {
      getRideDriver: jest.fn().mockResolvedValue({
        driverId: 'drv-profile-1',
        rideId: mockRideId,
        lat: 43.6532,
        lng: -79.3832,
        heading: 90,
        speedMps: 12.5,
        accuracyM: 5,
        recordedAt: new Date().toISOString(),
      }),
      getDriver: jest.fn(),
    };

    gatewayMock = {
      broadcastRideLocation: jest.fn(),
    };

    service = new TrackingService(prismaMock, storeMock, gatewayMock);
  });

  describe('createOrGetShareLink', () => {
    it('throws NotFoundException if ride does not exist', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(null);

      await expect(
        service.createOrGetShareLink(mockPassengerUserId, mockRideId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if user is not the ride passenger', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        passenger: { userId: mockPassengerUserId },
      });

      await expect(
        service.createOrGetShareLink(mockOtherUserId, mockRideId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('generates a new shareToken and returns shareUrl if none exists', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        passenger: { userId: mockPassengerUserId },
        shareToken: null,
        shareExpiresAt: null,
      });

      prismaMock.ride.update.mockResolvedValue({
        id: mockRideId,
        shareToken: 'generated-token',
        shareExpiresAt: new Date(Date.now() + 48 * 3600 * 1000),
      });

      const result = await service.createOrGetShareLink(
        mockPassengerUserId,
        mockRideId,
      );

      expect(result.rideId).toBe(mockRideId);
      expect(result.shareToken).toBeDefined();
      expect(result.shareUrl).toContain('/track/');
      expect(result.expiresAt).toBeDefined();
      expect(prismaMock.ride.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: mockRideId },
          data: expect.objectContaining({
            shareToken: expect.any(String),
            shareExpiresAt: expect.any(Date),
          }),
        }),
      );
    });

    it('reuses existing unexpired shareToken', async () => {
      const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        passenger: { userId: mockPassengerUserId },
        shareToken: mockShareToken,
        shareExpiresAt: futureDate,
      });

      const result = await service.createOrGetShareLink(
        mockPassengerUserId,
        mockRideId,
      );

      expect(result.shareToken).toBe(mockShareToken);
      expect(result.shareUrl).toContain(`/track/${mockShareToken}`);
      expect(prismaMock.ride.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeShareLink', () => {
    it('throws ForbiddenException if non-passenger tries to revoke', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        passenger: { userId: mockPassengerUserId },
      });

      await expect(
        service.revokeShareLink(mockOtherUserId, mockRideId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('clears shareToken and shareExpiresAt when passenger revokes', async () => {
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        passenger: { userId: mockPassengerUserId },
        shareToken: mockShareToken,
      });

      prismaMock.ride.update.mockResolvedValue({
        id: mockRideId,
        shareToken: null,
        shareExpiresAt: null,
      });

      const res = await service.revokeShareLink(mockPassengerUserId, mockRideId);
      expect(res.revoked).toBe(true);
      expect(prismaMock.ride.update).toHaveBeenCalledWith({
        where: { id: mockRideId },
        data: { shareToken: null, shareExpiresAt: null },
      });
    });
  });

  describe('getPublicSharedTrip', () => {
    it('throws BadRequestException if token is missing or empty', async () => {
      await expect(service.getPublicSharedTrip('')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException if share token does not exist', async () => {
      prismaMock.ride.findUnique.mockResolvedValue(null);

      await expect(
        service.getPublicSharedTrip('invalid-token'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if share link has expired', async () => {
      const pastDate = new Date(Date.now() - 3600 * 1000);
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        shareToken: mockShareToken,
        shareExpiresAt: pastDate,
      });

      await expect(
        service.getPublicSharedTrip(mockShareToken),
      ).rejects.toThrow('Trip share link has expired');
    });

    it('returns sanitized public trip tracking with driver and vehicle info', async () => {
      const futureDate = new Date(Date.now() + 3600 * 1000);
      prismaMock.ride.findUnique.mockResolvedValue({
        id: mockRideId,
        shareToken: mockShareToken,
        shareExpiresAt: futureDate,
        status: RideStatus.TRIP_STARTED,
        fromLabel: 'Union Station, Toronto',
        fromLat: 43.6453,
        fromLng: -79.3806,
        toLabel: 'Toronto Pearson Terminal 1',
        toLat: 43.6817,
        toLng: -79.6121,
        pickupAt: new Date('2026-10-01T12:00:00Z'),
        assignedDriverId: 'drv-profile-1',
        passenger: {
          user: { fullName: 'Sarah Connor', phone: '+14165551234' },
        },
        selectedOffer: {
          driver: {
            user: {
              id: 'drv-user-1',
              fullName: 'Michael Scott',
              avatarUrl: 'https://img.example.com/avatar.jpg',
            },
          },
          vehicle: {
            name: 'Toyota Camry',
            color: 'Silver',
            plate: 'CANR 888',
            year: 2024,
            vehicleClass: 'Comfort',
          },
        },
      });

      const data = await service.getPublicSharedTrip(mockShareToken);

      expect(data.rideId).toBe(mockRideId);
      expect(data.shareToken).toBe(mockShareToken);
      expect(data.status).toBe(RideStatus.TRIP_STARTED);
      expect(data.passengerFirstName).toBe('Sarah');
      expect(data.pickup.label).toBe('Union Station, Toronto');
      expect(data.dropoff?.label).toBe('Toronto Pearson Terminal 1');

      // Driver details
      expect(data.driver).toBeDefined();
      expect(data.driver?.firstName).toBe('Michael');
      expect(data.driver?.vehicle?.plate).toBe('CANR 888');
      expect(data.driver?.vehicle?.makeModel).toBe('Toyota Camry');
      expect(data.driver?.vehicle?.color).toBe('Silver');
      expect(data.driver?.rating).toBe(4.5);

      // Live location and ETA
      expect(data.live?.lat).toBe(43.6532);
      expect(data.live?.lng).toBe(-79.3832);
      expect(data.eta).toBeDefined();
      expect(data.isCompleted).toBe(false);
      expect(data.isCancelled).toBe(false);
    });
  });
});
