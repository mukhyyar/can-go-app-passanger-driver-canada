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

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  DEFAULT_VEHICLE_CATEGORIES,
  PricingService,
  serializeVehicleCategoryRow,
} from './pricing.service';
import { MarketplaceService } from './marketplace.service';

describe('Vehicle and Document Regulatory Offer Gate', () => {
  interface MockVehicle {
    id: string;
    isActive: boolean;
    approvalStatus: string;
    inspectionStatus: string;
  }

  interface MockDoc {
    docType: string;
    status: string;
    expiresAt?: Date | null;
  }

  function validateVehicleEligibility(
    vehicle: MockVehicle,
    vehicleDocs: MockDoc[] = [],
  ) {
    if (!vehicle.isActive) {
      throw new BadRequestException('Vehicle is not active');
    }
    if (vehicle.approvalStatus.toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Selected vehicle is pending admin approval',
      );
    }
    if (vehicle.inspectionStatus.toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Selected vehicle inspection is pending approval',
      );
    }

    const pendingOrAction = vehicleDocs.find((d) =>
      ['PENDING', 'NEEDS_RESUBMISSION', 'REJECTED'].includes(
        d.status.toUpperCase(),
      ),
    );
    if (pendingOrAction) {
      throw new ForbiddenException(
        `Vehicle document (${pendingOrAction.docType}) is under review or requires action. You cannot submit offers with this vehicle until verified.`,
      );
    }

    const expired = vehicleDocs.find(
      (d) => d.expiresAt && d.expiresAt.getTime() < Date.now(),
    );
    if (expired) {
      throw new ForbiddenException(
        `Vehicle document (${expired.docType}) has expired. Please upload an updated document.`,
      );
    }

    return true;
  }

  it('rejects vehicle when approvalStatus is PENDING', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'PENDING',
      inspectionStatus: 'APPROVED',
    };
    expect(() => validateVehicleEligibility(v)).toThrow(BadRequestException);
    expect(() => validateVehicleEligibility(v)).toThrow(
      'Selected vehicle is pending admin approval',
    );
  });

  it('rejects vehicle when inspectionStatus is PENDING', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'PENDING',
    };
    expect(() => validateVehicleEligibility(v)).toThrow(BadRequestException);
    expect(() => validateVehicleEligibility(v)).toThrow(
      'Selected vehicle inspection is pending approval',
    );
  });

  it('rejects vehicle when vehicle has document in PENDING review', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'APPROVED',
    };
    const docs: MockDoc[] = [
      { docType: 'vehicle_registration', status: 'PENDING' },
    ];
    expect(() => validateVehicleEligibility(v, docs)).toThrow(
      ForbiddenException,
    );
    expect(() => validateVehicleEligibility(v, docs)).toThrow(
      'under review or requires action',
    );
  });

  it('rejects vehicle when vehicle has expired document', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'APPROVED',
    };
    const docs: MockDoc[] = [
      {
        docType: 'insurance',
        status: 'APPROVED',
        expiresAt: new Date(Date.now() - 10000),
      },
    ];
    expect(() => validateVehicleEligibility(v, docs)).toThrow(
      ForbiddenException,
    );
    expect(() => validateVehicleEligibility(v, docs)).toThrow('has expired');
  });

  it('permits vehicle when approved, inspected, and documents are valid', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'APPROVED',
    };
    const docs: MockDoc[] = [
      {
        docType: 'insurance',
        status: 'APPROVED',
        expiresAt: new Date(Date.now() + 86400000),
      },
    ];
    expect(validateVehicleEligibility(v, docs)).toBe(true);
  });

  describe('Passenger Vehicle Preference Selection (Non-Restrictive Driver Bidding & Admin-Configurable Categories)', () => {
    it('provides configurable default vehicle categories including Economy, Comfort, Premium, SUV, 7-Seater / Minivan, and Luxury Vehicle', async () => {
      const mockPrisma: any = {
        catalogItem: {
          findMany: jest.fn().mockResolvedValue([]),
        },
      };
      const pricing = new PricingService(mockPrisma);
      const categories = await pricing.listActiveVehicleCategories();
      const names = categories.map((c) => c.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'Economy',
          'Comfort',
          'Premium',
          'SUV',
          '7-Seater / Minivan',
          'Luxury Vehicle',
        ]),
      );

      const custom = serializeVehicleCategoryRow({
        id: 'cat-1',
        slug: 'vc-executive_suv',
        title: 'Executive SUV',
        description: 'Up to 6 passengers',
        basePrice: 80,
        currency: 'CAD',
        active: true,
        meta: {
          passengerSeats: 6,
          luggagePlaces: 5,
          isLuxury: true,
          sortOrder: 2,
        },
      });
      expect(custom.id).toBe('executive_suv');
      expect(custom.name).toBe('Executive SUV');
      expect(custom.fromPrice).toBe('from CA$80');
      expect(custom.passengerSeats).toBe(6);
      expect(custom.isLuxury).toBe(true);
      expect(DEFAULT_VEHICLE_CATEGORIES.length).toBeGreaterThanOrEqual(6);
    });

    it('treats passenger selected vehicle category as a preference — allows eligible drivers of any vehicle class to submit offers', async () => {
      const mockPrisma: any = {
        vehicle: {
          findFirst: jest.fn().mockResolvedValue({
            id: 'veh-sedan-1',
            driverId: 'drv-1',
            name: 'Toyota Camry',
            plate: 'ABC 123',
            vehicleClass: 'sedan',
            passengerSeats: 4,
            isActive: true,
            approvalStatus: 'APPROVED',
            inspectionStatus: 'APPROVED',
          }),
        },
        driverDocument: {
          findFirst: jest.fn().mockResolvedValue(null),
        },
      };

      const mkt = new MarketplaceService(
        mockPrisma,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        { get: jest.fn() } as never,
      );

      // Passenger selected 'luxury' as preferred vehicle category, but driver has a 'sedan'
      const eligibleVehicle = await (mkt as any).requireEligibleVehicle(
        'drv-1',
        'veh-sedan-1',
        {
          vehicleClassIds: ['luxury'],
          adults: 2,
        },
      );

      expect(eligibleVehicle.id).toBe('veh-sedan-1');
      expect(mkt.matchesVehiclePreference('sedan', ['luxury'])).toBe(false);
      expect(mkt.matchesVehiclePreference('sedan', ['economy'])).toBe(true);
      expect(mkt.matchesVehiclePreference('luxury', ['luxury'])).toBe(true);
    });
  });
});
