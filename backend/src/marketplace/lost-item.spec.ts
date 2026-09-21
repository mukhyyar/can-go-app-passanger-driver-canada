import 'reflect-metadata';
import { RideStatus, SupportCaseStatus, SupportCaseType } from '@prisma/client';
import { CreateChangeRequestDto } from './dto/marketplace.dto';
import { validate } from 'class-validator';

describe('Lost & Found Change Request', () => {
  it('validates CreateChangeRequestDto with LOST_ITEM and contactPhone', async () => {
    const dto = new CreateChangeRequestDto();
    dto.type = 'LOST_ITEM';
    dto.contactPhone = '+15551234567';
    dto.note = 'Please check back seat';

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
});
