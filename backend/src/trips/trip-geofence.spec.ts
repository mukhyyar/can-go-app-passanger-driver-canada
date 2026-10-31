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
import { TripService, GEOFENCE_LIMITS } from './trip.service';

describe('TripService Geofencing and Restrictions', () => {
  let tripService: TripService;
  let mockPrisma: any;
  let mockNotifications: any;
  let mockTracking: any;
  let mockWallet: any;
  let mockLocationStore: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
      },
      ride: {
        findUnique: jest.fn(),
      },
      rideEvent: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      chatThread: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn((callback) =>
        callback({
          ride: { update: jest.fn() },
          rideEvent: { create: jest.fn() },
          auditLog: { create: jest.fn() },
          rideFinancial: { findUnique: jest.fn().mockResolvedValue(null) },
          driverPayout: { findFirst: jest.fn().mockResolvedValue(null) },
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
      creditEarningForCompletedRide: jest.fn().mockResolvedValue(undefined),
    };
    mockLocationStore = {
      getRideDriver: jest.fn().mockResolvedValue(null),
      getDriver: jest.fn().mockResolvedValue(null),
    };

    tripService = new TripService(
      mockPrisma,
      mockNotifications,
      mockTracking,
      mockWallet,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockLocationStore,
    );
  });

  const driverUserId = 'driver-user-1';
  const driverProfileId = 'driver-profile-1';
  const rideId = 'ride-geo-100';
  const correctPin = '4321';

  // Base coordinates: Calgary downtown (51.0447, -114.0719)
  const pickupLat = 51.0447;
  const pickupLng = -114.0719;

  // Dropoff coordinates: Calgary Airport (51.1215, -114.0076)
  const dropoffLat = 51.1215;
  const dropoffLng = -114.0076;

  // Coordinates ~200m from pickup (approx 0.0018 lat offset is ~200m)
  const nearPickupLat = 51.0465;
  const nearPickupLng = -114.0719;

  // Coordinates ~800m from pickup (approx 0.0072 lat offset is ~800m)
  const farPickupLat = 51.0520;
  const farPickupLng = -114.0719;

  // Coordinates ~200m from dropoff
  const nearDropoffLat = 51.1230;
  const nearDropoffLng = -114.0076;

  // Coordinates ~1500m from dropoff
  const farDropoffLat = 51.1080;
  const farDropoffLng = -114.0076;

  const mockDriverUser = {
    id: driverUserId,
    role: UserRole.DRIVER,
    driverProfile: { id: driverProfileId, drivingEnabled: true },
    passengerProfile: null,
  };

  const mockAdminUser = {
    id: 'admin-user-1',
    role: UserRole.ADMIN,
    driverProfile: null,
    passengerProfile: null,
  };

  const createMockRide = (status: RideStatus) => ({
    id: rideId,
    status,
    assignedDriverId: driverProfileId,
    startPin: correctPin,
    passenger: { userId: 'passenger-user-1', fullName: 'Bob Passenger' },
    selectedOffer: { driver: { id: driverProfileId, userId: driverUserId } },
    priceSnapshot: { startPin: correctPin },
    fromLat: pickupLat,
    fromLng: pickupLng,
    toLat: dropoffLat,
    toLng: dropoffLng,
    fromLabel: 'Calgary Downtown',
    toLabel: 'Calgary Airport',
    pickupAt: new Date(),
  });

  describe('TRIP_STARTED geofence (< 500m + PIN)', () => {
    it('rejects TRIP_STARTED when driver provides valid PIN but no GPS coordinates', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(
        createMockRide(RideStatus.DRIVER_ARRIVED),
      );

      await expect(
        tripService.transition(
          driverUserId,
          rideId,
          RideStatus.TRIP_STARTED,
          '127.0.0.1',
          correctPin,
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Current GPS coordinates are required to start the ride.',
        ),
      );
    });

    it('rejects TRIP_STARTED when driver is farther than 500m from pickup location', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(
        createMockRide(RideStatus.DRIVER_ARRIVED),
      );

      await expect(
        tripService.transition(
          driverUserId,
          rideId,
          RideStatus.TRIP_STARTED,
          '127.0.0.1',
          correctPin,
          { lat: farPickupLat, lng: farPickupLng },
        ),
      ).rejects.toThrow(/Driver must be within 500m of the pickup location/);
    });

    it('allows TRIP_STARTED when driver is within 500m (< 500m) with correct PIN', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.DRIVER_ARRIVED))
        .mockResolvedValueOnce(createMockRide(RideStatus.TRIP_STARTED));

      const result = await tripService.transition(
        driverUserId,
        rideId,
        RideStatus.TRIP_STARTED,
        '127.0.0.1',
        correctPin,
        { lat: nearPickupLat, lng: nearPickupLng },
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.TRIP_STARTED);
    });

    it('uses cached location store coordinates if payload coordinates are null and within 500m', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.DRIVER_ARRIVED))
        .mockResolvedValueOnce(createMockRide(RideStatus.TRIP_STARTED));

      mockLocationStore.getRideDriver.mockResolvedValue({
        lat: nearPickupLat,
        lng: nearPickupLng,
      });

      const result = await tripService.transition(
        driverUserId,
        rideId,
        RideStatus.TRIP_STARTED,
        '127.0.0.1',
        correctPin,
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.TRIP_STARTED);
    });
  });

  describe('DRIVER_ARRIVED geofence (< 300m)', () => {
    it('rejects DRIVER_ARRIVED when GPS coordinates are missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(
        createMockRide(RideStatus.DRIVER_EN_ROUTE),
      );

      await expect(
        tripService.transition(
          driverUserId,
          rideId,
          RideStatus.DRIVER_ARRIVED,
          '127.0.0.1',
        ),
      ).rejects.toThrow(
        new BadRequestException(
          'Current GPS coordinates are required to mark arrival at the pickup location.',
        ),
      );
    });

    it('rejects DRIVER_ARRIVED when driver is farther than 300m', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(
        createMockRide(RideStatus.DRIVER_EN_ROUTE),
      );

      await expect(
        tripService.transition(
          driverUserId,
          rideId,
          RideStatus.DRIVER_ARRIVED,
          '127.0.0.1',
          undefined,
          { lat: farPickupLat, lng: farPickupLng },
        ),
      ).rejects.toThrow(/Driver must be within 300m of the pickup location/);
    });

    it('allows DRIVER_ARRIVED when driver is within 300m of pickup location', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.DRIVER_EN_ROUTE))
        .mockResolvedValueOnce(createMockRide(RideStatus.DRIVER_ARRIVED));

      const result = await tripService.transition(
        driverUserId,
        rideId,
        RideStatus.DRIVER_ARRIVED,
        '127.0.0.1',
        undefined,
        { lat: nearPickupLat, lng: nearPickupLng },
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.DRIVER_ARRIVED);
    });
  });

  describe('COMPLETED geofence (< 500m with early dropoff bypass)', () => {
    it('rejects COMPLETED when driver is far from dropoff without early dropoff confirmation', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique.mockResolvedValue(
        createMockRide(RideStatus.IN_PROGRESS),
      );

      await expect(
        tripService.transition(
          driverUserId,
          rideId,
          RideStatus.COMPLETED,
          '127.0.0.1',
          undefined,
          { lat: farDropoffLat, lng: farDropoffLng },
        ),
      ).rejects.toThrow(/away from the drop-off destination.*confirm early drop-off/);
    });

    it('allows COMPLETED when driver is far from dropoff if forceEarlyDropoff is true', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.IN_PROGRESS))
        .mockResolvedValueOnce(createMockRide(RideStatus.COMPLETED));

      const result = await tripService.transition(
        driverUserId,
        rideId,
        RideStatus.COMPLETED,
        '127.0.0.1',
        undefined,
        {
          lat: farDropoffLat,
          lng: farDropoffLng,
          forceEarlyDropoff: true,
          reasonDetails: 'Passenger requested early exit due to traffic',
        },
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.COMPLETED);
    });

    it('allows COMPLETED when driver is within 500m of dropoff destination', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockDriverUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.IN_PROGRESS))
        .mockResolvedValueOnce(createMockRide(RideStatus.COMPLETED));

      const result = await tripService.transition(
        driverUserId,
        rideId,
        RideStatus.COMPLETED,
        '127.0.0.1',
        undefined,
        { lat: nearDropoffLat, lng: nearDropoffLng },
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.COMPLETED);
    });
  });

  describe('Admin override bypass', () => {
    it('allows admin to transition to TRIP_STARTED without GPS coordinates', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdminUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.DRIVER_ARRIVED))
        .mockResolvedValueOnce(createMockRide(RideStatus.TRIP_STARTED));

      const result = await tripService.transition(
        'admin-user-1',
        rideId,
        RideStatus.TRIP_STARTED,
        '127.0.0.1',
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.TRIP_STARTED);
    });

    it('allows admin to complete trip far from destination', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockAdminUser);
      mockPrisma.ride.findUnique
        .mockResolvedValueOnce(createMockRide(RideStatus.IN_PROGRESS))
        .mockResolvedValueOnce(createMockRide(RideStatus.COMPLETED));

      const result = await tripService.transition(
        'admin-user-1',
        rideId,
        RideStatus.COMPLETED,
        '127.0.0.1',
      );

      expect(result.id).toBe(rideId);
      expect(result.status).toBe(RideStatus.COMPLETED);
    });
  });
});
