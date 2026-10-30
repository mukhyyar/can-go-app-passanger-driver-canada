import { BadRequestException, ForbiddenException } from '@nestjs/common';

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

  function validateVehicleEligibility(vehicle: MockVehicle, vehicleDocs: MockDoc[] = []) {
    if (!vehicle.isActive) {
      throw new BadRequestException('Vehicle is not active');
    }
    if (vehicle.approvalStatus.toUpperCase() !== 'APPROVED') {
      throw new BadRequestException('Selected vehicle is pending admin approval');
    }
    if (vehicle.inspectionStatus.toUpperCase() !== 'APPROVED') {
      throw new BadRequestException('Selected vehicle inspection is pending approval');
    }

    const pendingOrAction = vehicleDocs.find((d) =>
      ['PENDING', 'NEEDS_RESUBMISSION', 'REJECTED'].includes(d.status.toUpperCase()),
    );
    if (pendingOrAction) {
      throw new ForbiddenException(
        `Vehicle document (${pendingOrAction.docType}) is under review or requires action. You cannot submit offers with this vehicle until verified.`,
      );
    }

    const expired = vehicleDocs.find((d) => d.expiresAt && d.expiresAt.getTime() < Date.now());
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
    expect(() => validateVehicleEligibility(v)).toThrow('Selected vehicle is pending admin approval');
  });

  it('rejects vehicle when inspectionStatus is PENDING', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'PENDING',
    };
    expect(() => validateVehicleEligibility(v)).toThrow(BadRequestException);
    expect(() => validateVehicleEligibility(v)).toThrow('Selected vehicle inspection is pending approval');
  });

  it('rejects vehicle when vehicle has document in PENDING review', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'APPROVED',
    };
    const docs: MockDoc[] = [{ docType: 'vehicle_registration', status: 'PENDING' }];
    expect(() => validateVehicleEligibility(v, docs)).toThrow(ForbiddenException);
    expect(() => validateVehicleEligibility(v, docs)).toThrow('under review or requires action');
  });

  it('rejects vehicle when vehicle has expired document', () => {
    const v: MockVehicle = {
      id: 'v1',
      isActive: true,
      approvalStatus: 'APPROVED',
      inspectionStatus: 'APPROVED',
    };
    const docs: MockDoc[] = [
      { docType: 'insurance', status: 'APPROVED', expiresAt: new Date(Date.now() - 10000) },
    ];
    expect(() => validateVehicleEligibility(v, docs)).toThrow(ForbiddenException);
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
      { docType: 'insurance', status: 'APPROVED', expiresAt: new Date(Date.now() + 86400000) },
    ];
    expect(validateVehicleEligibility(v, docs)).toBe(true);
  });
});

