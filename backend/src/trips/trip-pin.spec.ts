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

import { BadRequestException } from '@nestjs/common';
import { RideStatus, UserRole } from '@prisma/client';
import { TripService } from './trip.service';

describe('TripService PIN validation on TRIP_STARTED', () => {
  let tripService: TripService;
  let mockPrisma: any;
  let mockNotifications: any;
  let mockTracking: any;
  let mockWallet: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      ride: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn((callback) =>
        callback({
          ride: { update: jest.fn() },
          rideEvent: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        }),
      ),
    };
    mockNotifications = {
      notifyRideStatus: jest.fn().mockResolvedValue(undefined),
    };
    mockTracking = {
      emitRideEvent: jest.fn(),
    };
    mockWallet = {
      creditEarningForCompletedRide: jest.fn(),
    };

    tripService = new TripService(
      mockPrisma,
      mockNotifications,
      mockTracking,
      mockWallet,
    );
  });

  const driverUserId = 'user-driver-1';
  const driverProfileId = 'dp-1';
  const rideId = 'ride-123';
  const correctPin = '5482';

  const mockDriverUser = {
    id: driverUserId,
    role: UserRole.DRIVER,
    driverProfile: { id: driverProfileId },
    passengerProfile: null,
  };

  const mockRide = {
    id: rideId,
    status: RideStatus.DRIVER_ARRIVED,
    assignedDriverId: driverProfileId,
    startPin: correctPin,
    passenger: { userId: 'passenger-user-1', fullName: 'Alice Rider' },
    selectedOffer: { driver: { id: driverProfileId, userId: driverUserId } },
    priceSnapshot: { startPin: correctPin },
    fromLabel: '100 Queen St W',
  };

  it('rejects TRIP_STARTED when driver provides no PIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
    mockPrisma.ride.findUnique.mockResolvedValue(mockRide);

    await expect(
      tripService.transition(
        driverUserId,
        rideId,
        RideStatus.TRIP_STARTED,
        '127.0.0.1',
        undefined,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects TRIP_STARTED when driver provides incorrect PIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
    mockPrisma.ride.findUnique.mockResolvedValue(mockRide);

    await expect(
      tripService.transition(
        driverUserId,
        rideId,
        RideStatus.TRIP_STARTED,
        '127.0.0.1',
        '9999',
      ),
    ).rejects.toThrow('Invalid ride PIN. Please ask the passenger for their 4-digit ride PIN.');
  });

  it('allows TRIP_STARTED when driver provides correct PIN', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
    mockPrisma.ride.findUnique
      .mockResolvedValueOnce(mockRide)
      .mockResolvedValueOnce({ ...mockRide, status: RideStatus.IN_PROGRESS });

    const result = await tripService.transition(
      driverUserId,
      rideId,
      RideStatus.TRIP_STARTED,
      '127.0.0.1',
      correctPin,
    );

    expect(result.id).toBe(rideId);
    expect(mockNotifications.notifyRideStatus).toHaveBeenCalled();
  });
});
