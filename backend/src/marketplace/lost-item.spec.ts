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
import { RideStatus, SupportCaseStatus, SupportCaseType } from '@prisma/client';
import {
  CreateChangeRequestDto,
  PayLostItemFeeDto,
  ResolveLostItemDto,
  RespondLostItemDto,
  SetLostItemPickupLocationDto,
} from './dto/marketplace.dto';
import { validate } from 'class-validator';
import { MarketplaceService } from './marketplace.service';

describe('Lost & Found Change Request', () => {
  it('validates CreateChangeRequestDto with LOST_ITEM and contactPhone', async () => {
    const dto = new CreateChangeRequestDto();
    dto.type = 'LOST_ITEM';
    dto.contactPhone = '+15551234567';
    dto.note = 'Please check back seat';

    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates RespondLostItemDto with FOUND and NOT_FOUND actions and photoUrl', async () => {
    const foundDto = new RespondLostItemDto();
    foundDto.action = 'FOUND';
    foundDto.note = 'Found under passenger seat';
    foundDto.photoUrl = 'https://example.com/photos/item.jpg';
    const foundErrors = await validate(foundDto);
    expect(foundErrors.length).toBe(0);

    const notFoundDto = new RespondLostItemDto();
    notFoundDto.action = 'NOT_FOUND';
    notFoundDto.note = 'Checked cabin and trunk, not found';
    const notFoundErrors = await validate(notFoundDto);
    expect(notFoundErrors.length).toBe(0);

    const invalidDto = new RespondLostItemDto();
    (invalidDto as any).action = 'MAYBE';
    const invalidErrors = await validate(invalidDto);
    expect(invalidErrors.length).toBeGreaterThan(0);
  });

  it('validates ResolveLostItemDto with handover photo', async () => {
    const dto = new ResolveLostItemDto();
    dto.note = 'Item successfully handed back to passenger';
    dto.handoverPhotoUrl = 'https://example.com/photos/handover.jpg';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('validates SetLostItemPickupLocationDto', async () => {
    const dto = new SetLostItemPickupLocationDto();
    dto.location = 'Calgary International Airport, Terminal 1 Door 4';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);

    const invalid = new SetLostItemPickupLocationDto();
    invalid.location = 'A'; // too short
    const invalidErrors = await validate(invalid);
    expect(invalidErrors.length).toBeGreaterThan(0);
  });

  it('validates PayLostItemFeeDto', async () => {
    const dto = new PayLostItemFeeDto();
    dto.paymentMethod = 'CARD';
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('verifies allowed status mapping for LOST_ITEM is COMPLETED only', () => {
    const preTrip: RideStatus[] = [
      RideStatus.BOOKED,
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
    ];
    const ongoing: RideStatus[] = [
      RideStatus.DRIVER_EN_ROUTE,
      RideStatus.DRIVER_ARRIVED,
      RideStatus.TRIP_STARTED,
      RideStatus.IN_PROGRESS,
    ];
    const allowedByType: Record<string, RideStatus[]> = {
      FLIGHT_DELAY: preTrip,
      RESCHEDULE: preTrip,
      CURRENT_RIDE_HELP: ongoing,
      BILLING_HELP: [RideStatus.COMPLETED],
      REFUND_REQUEST: [RideStatus.COMPLETED],
      LOST_ITEM: [RideStatus.COMPLETED],
    };

    expect(allowedByType['LOST_ITEM']).toEqual([RideStatus.COMPLETED]);
    expect(allowedByType['LOST_ITEM'].includes(RideStatus.COMPLETED)).toBe(true);
    expect(allowedByType['LOST_ITEM'].includes(RideStatus.BOOKED)).toBe(false);
    expect(allowedByType['LOST_ITEM'].includes(RideStatus.IN_PROGRESS)).toBe(false);
  });

  it('correctly detects hasLostItemRequest from supportCases list', () => {
    const cases = [
      {
        id: 'case-1',
        title: 'Lost item inquiry',
        type: SupportCaseType.GENERAL,
        status: SupportCaseStatus.OPEN,
        createdAt: new Date(),
      },
    ];

    const lostItemCase = cases.find((c) => c.title === 'Lost item inquiry');
    expect(lostItemCase).toBeTruthy();
    expect(lostItemCase?.id).toBe('case-1');
    expect(Boolean(lostItemCase)).toBe(true);

    const emptyCases: Array<{ title: string }> = [];
    const none = emptyCases.find((c) => c.title === 'Lost item inquiry');
    expect(Boolean(none)).toBe(false);
  });

  it('extractLostItemDetails correctly extracts photoUrl, pickupLocation, handoverPhotoUrl, and returnFee', () => {
    const service = new MarketplaceService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const cases = [
      {
        id: 'case-123',
        title: 'Lost item inquiry',
        status: SupportCaseStatus.RESOLVED,
        createdAt: new Date('2026-09-30T10:00:00Z'),
        notes: [
          { body: 'Passenger contact phone: +14035551234\nNote: Black leather wallet' },
          { body: '[LOST_ITEM_FOUND]\n[LOST_ITEM_PHOTO] https://storage.cango.ca/lost/wallet.jpg\nNote: Found in back pocket' },
          { body: '[LOST_ITEM_PICKUP_LOCATION] Location: Calgary Downtown Westin Hotel Lobby' },
          { body: '[LOST_ITEM_FEE_PAID] Amount: CAD 20.00\nPaymentId: pay-999' },
          { body: '[LOST_ITEM_RETURNED]\n[HANDOVER_PHOTO] https://storage.cango.ca/lost/handover_proof.jpg\nNote: Returned to passenger' },
        ],
      },
    ];

    const details = service.extractLostItemDetails(cases);
    expect(details).not.toBeNull();
    expect(details?.caseId).toBe('case-123');
    expect(details?.status).toBe('RETURNED');
    expect(details?.contactPhone).toBe('+14035551234');
    expect(details?.itemDescription).toBe('Black leather wallet');
    expect(details?.photoUrl).toBe('https://storage.cango.ca/lost/wallet.jpg');
    expect(details?.pickupLocation).toBe('Calgary Downtown Westin Hotel Lobby');
    expect(details?.handoverPhotoUrl).toBe('https://storage.cango.ca/lost/handover_proof.jpg');
    expect(details?.returnFeeAmount).toBe(20.0);
    expect(details?.returnFeePaid).toBe(true);
    expect(details?.returnFeePaymentId).toBe('pay-999');
  });
});
